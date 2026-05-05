"use strict";

const crypto = require("crypto");
const { MoleculerError } = require("moleculer").Errors;
const {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const AuthMixin = require("../mixins/auth.mixin");
const PrismaMixin = require("../mixins/prisma.mixin");
const { AUDIT_ACTIONS, ENTITY_TYPES } = require("../mongodb/schemas/audit_logs");

const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024;
const DEFAULT_SIGNED_URL_EXPIRES = 15 * 60;

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema
 * @typedef {import('moleculer').Context} Context
 */

/** @type {ServiceSchema} */
module.exports = {
	name: "documents",
	mixins: [PrismaMixin, AuthMixin],

	settings: {
		upload: {
			maxFileSize: DEFAULT_MAX_FILE_SIZE,
			signedUrlExpiresIn: DEFAULT_SIGNED_URL_EXPIRES
		}
	},

	created() {
		this._initStorageClient();
	},

	actions: {
		uploadDocument: {
			auth: "required",
			async handler(ctx) {
				const multipart = this._requireMultipart(ctx);
				const projectId = multipart.projectId;

				if (!projectId) {
					throw new MoleculerError("projectId is required", 422, "ERR_VALIDATION");
				}

				await this.checkProjectAccess(ctx, projectId, "member");

				const file = ctx.params;
				const { fileName, contentType } = this._getFileMeta(file);
				const storageKey = this._buildStorageKey("documents", projectId, fileName);

				await this._uploadToBucket(storageKey, file, contentType);

				const document = await this.prisma.document.create({
					data: {
						projectId,
						fileName,
						storageKey
					}
				});

				await this._logAudit(ctx, {
					entityType: ENTITY_TYPES.DOCUMENT,
					entityId: document.id,
					action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
					details: {
						projectId,
						fileName,
						storageKey
					}
				});

				return {
					document,
					url: this._buildPublicUrl(storageKey)
				};
			}
		},

		uploadTaskAttachment: {
			auth: "required",
			async handler(ctx) {
				const multipart = this._requireMultipart(ctx);
				const taskId = multipart.taskId;

				if (!taskId) {
					throw new MoleculerError("taskId is required", 422, "ERR_VALIDATION");
				}

				const task = await this.prisma.task.findUnique({
					where: { id: taskId },
					select: { id: true, projectId: true }
				});

				if (!task) {
					throw new MoleculerError("Task not found", 404, "ERR_NOT_FOUND");
				}

				await this.checkProjectAccess(ctx, task.projectId, "member");

				const file = ctx.params;
				const { fileName, contentType } = this._getFileMeta(file);
				const storageKey = this._buildStorageKey("task-attachments", taskId, fileName);

				await this._uploadToBucket(storageKey, file, contentType);

				const fileUrl = this._buildPublicUrl(storageKey);
				const attachment = await this.prisma.taskAttachment.create({
					data: {
						taskId,
						fileName,
						fileUrl,
						uploadedBy: ctx.meta.user.id
					}
				});

				await this._logAudit(ctx, {
					entityType: ENTITY_TYPES.TASK_ATTACHMENT,
					entityId: attachment.id,
					action: AUDIT_ACTIONS.TASK_ATTACHMENT_UPLOADED,
					details: {
						taskId,
						projectId: task.projectId,
						fileName,
						storageKey
					}
				});

				return {
					attachment,
					url: fileUrl
				};
			}
		},

		listDocuments: {
			rest: "GET /",
			auth: "required",
			params: {
				projectId: "string"
			},
			async handler(ctx) {
				const { projectId } = ctx.params;
				await this.checkProjectAccess(ctx, projectId, "viewer");

				return this.prisma.document.findMany({
					where: { projectId },
					orderBy: { createdAt: "desc" }
				});
			}
		},

		getDocument: {
			rest: "GET /:id",
			auth: "required",
			params: {
				id: "string"
			},
			async handler(ctx) {
				const document = await this.prisma.document.findUnique({
					where: { id: ctx.params.id }
				});

				if (!document) {
					throw new MoleculerError("Document not found", 404, "ERR_NOT_FOUND");
				}

				await this.checkProjectAccess(ctx, document.projectId, "viewer");
				return document;
			}
		},

		getDocumentDownloadUrl: {
			rest: "GET /:id/download",
			auth: "required",
			params: {
				id: "string",
				expiresIn: { type: "number", optional: true }
			},
			async handler(ctx) {
				const document = await this.prisma.document.findUnique({
					where: { id: ctx.params.id }
				});

				if (!document) {
					throw new MoleculerError("Document not found", 404, "ERR_NOT_FOUND");
				}

				await this.checkProjectAccess(ctx, document.projectId, "viewer");

				const expiresIn = this._normalizeExpires(ctx.params.expiresIn);
				const url = await this._createSignedUrl(document.storageKey, expiresIn);
				return this._redirectToUrl(ctx, url);
			}
		},

		deleteDocument: {
			rest: "DELETE /:id",
			auth: "required",
			params: {
				id: "string"
			},
			async handler(ctx) {
				const document = await this.prisma.document.findUnique({
					where: { id: ctx.params.id }
				});

				if (!document) {
					throw new MoleculerError("Document not found", 404, "ERR_NOT_FOUND");
				}

				await this.checkProjectAccess(ctx, document.projectId, "admin");

				await this._deleteFromBucket(document.storageKey);
				await this.prisma.document.delete({ where: { id: document.id } });

				await this._logAudit(ctx, {
					entityType: ENTITY_TYPES.DOCUMENT,
					entityId: document.id,
					action: AUDIT_ACTIONS.DOCUMENT_DELETED,
					details: {
						projectId: document.projectId,
						fileName: document.fileName,
						storageKey: document.storageKey
					}
				});

				return { deleted: true };
			}
		},

		listTaskAttachments: {
			rest: "GET /task/:taskId/attachments",
			auth: "required",
			params: {
				taskId: "string"
			},
			async handler(ctx) {
				const task = await this.prisma.task.findUnique({
					where: { id: ctx.params.taskId },
					select: { id: true, projectId: true }
				});

				if (!task) {
					throw new MoleculerError("Task not found", 404, "ERR_NOT_FOUND");
				}

				await this.checkProjectAccess(ctx, task.projectId, "viewer");

				return this.prisma.taskAttachment.findMany({
					where: { taskId: task.id },
					orderBy: { createdAt: "desc" }
				});
			}
		},

		getTaskAttachmentDownloadUrl: {
			rest: "GET /task-attachments/:id/download",
			auth: "required",
			params: {
				id: "string",
				expiresIn: { type: "number", optional: true }
			},
			async handler(ctx) {
				const attachment = await this.prisma.taskAttachment.findUnique({
					where: { id: ctx.params.id }
				});

				if (!attachment) {
					throw new MoleculerError("Attachment not found", 404, "ERR_NOT_FOUND");
				}

				const task = await this.prisma.task.findUnique({
					where: { id: attachment.taskId },
					select: { projectId: true }
				});

				if (!task) {
					throw new MoleculerError("Task not found", 404, "ERR_NOT_FOUND");
				}

				await this.checkProjectAccess(ctx, task.projectId, "viewer");

				const storageKey = this._extractKeyFromUrl(attachment.fileUrl);
				if (!storageKey) {
					return this._redirectToUrl(ctx, attachment.fileUrl);
				}

				const expiresIn = this._normalizeExpires(ctx.params.expiresIn);
				const url = await this._createSignedUrl(storageKey, expiresIn);
				return this._redirectToUrl(ctx, url);
			}
		},

		deleteTaskAttachment: {
			rest: "DELETE /task-attachments/:id",
			auth: "required",
			params: {
				id: "string"
			},
			async handler(ctx) {
				const attachment = await this.prisma.taskAttachment.findUnique({
					where: { id: ctx.params.id }
				});

				if (!attachment) {
					throw new MoleculerError("Attachment not found", 404, "ERR_NOT_FOUND");
				}

				const task = await this.prisma.task.findUnique({
					where: { id: attachment.taskId },
					select: { id: true, projectId: true }
				});

				if (!task) {
					throw new MoleculerError("Task not found", 404, "ERR_NOT_FOUND");
				}

				await this.checkProjectAccess(ctx, task.projectId, "admin");

				const storageKey = this._extractKeyFromUrl(attachment.fileUrl);
				if (storageKey) {
					await this._deleteFromBucket(storageKey);
				}

				await this.prisma.taskAttachment.delete({ where: { id: attachment.id } });

				await this._logAudit(ctx, {
					entityType: ENTITY_TYPES.TASK_ATTACHMENT,
					entityId: attachment.id,
					action: AUDIT_ACTIONS.TASK_ATTACHMENT_DELETED,
					details: {
						taskId: task.id,
						projectId: task.projectId,
						fileName: attachment.fileName
					}
				});

				return { deleted: true };
			}
		}
	},

	methods: {
		_initStorageClient() {
			this._storageConfig = {
				endpoint: process.env.B2_ENDPOINT,
				region: process.env.B2_REGION,
				bucket: process.env.B2_BUCKET_NAME,
				keyId: process.env.B2_KEY_ID,
				appKey: process.env.B2_APP_KEY
			};

			this.s3 = new S3Client({
				endpoint: this._storageConfig.endpoint
					? `https://${this._storageConfig.endpoint}`
					: undefined,
				region: this._storageConfig.region || "us-east-005",
				credentials: this._storageConfig.keyId
					? {
							accessKeyId: this._storageConfig.keyId,
							secretAccessKey: this._storageConfig.appKey
						}
					: undefined,
				forcePathStyle: true
			});
		},

		_requireMultipart(ctx) {
			if (!ctx.meta || !ctx.meta.$multipart) {
				throw new MoleculerError(
					"Multipart form-data is required",
					415,
					"ERR_MULTIPART_REQUIRED"
				);
			}
			return ctx.meta.$multipart;
		},

		_getFileMeta(file) {
			if (!file || typeof file.pipe !== "function") {
				throw new MoleculerError("File stream not found", 422, "ERR_FILE_REQUIRED");
			}

			const fileName = this._sanitizeFileName(file.filename || "upload");
			const contentType = file.mimetype || "application/octet-stream";
			return { fileName, contentType };
		},

		_buildStorageKey(prefix, scopeId, fileName) {
			const safeName = this._sanitizeFileName(fileName);
			const randomId = crypto.randomUUID();
			return `${prefix}/${scopeId}/${randomId}-${safeName}`;
		},

		_sanitizeFileName(fileName) {
			return String(fileName)
				.replace(/\\/g, "/")
				.split("/")
				.pop()
				.replace(/\s+/g, "-")
				.replace(/[^a-zA-Z0-9._-]/g, "")
				.slice(0, 200);
		},

		async _uploadToBucket(storageKey, stream, contentType) {
			this._assertStorageConfig();

			const command = new PutObjectCommand({
				Bucket: this._storageConfig.bucket,
				Key: storageKey,
				Body: stream,
				ContentType: contentType
			});

			try {
				await this.s3.send(command);
			} catch (error) {
				this.logger.error("Failed to upload to Backblaze", error);
				throw new MoleculerError("Upload failed", 500, "ERR_UPLOAD_FAILED");
			}
		},

		async _deleteFromBucket(storageKey) {
			this._assertStorageConfig();
			const command = new DeleteObjectCommand({
				Bucket: this._storageConfig.bucket,
				Key: storageKey
			});

			try {
				await this.s3.send(command);
			} catch (error) {
				this.logger.warn("Failed to delete object", {
					storageKey,
					error: error.message
				});
			}
		},

		async _createSignedUrl(storageKey, expiresIn) {
			this._assertStorageConfig();
			const command = new GetObjectCommand({
				Bucket: this._storageConfig.bucket,
				Key: storageKey
			});

			return getSignedUrl(this.s3, command, { expiresIn });
		},

		_buildPublicUrl(storageKey) {
			if (!this._storageConfig.endpoint || !this._storageConfig.bucket) {
				return null;
			}
			return `https://${this._storageConfig.endpoint}/${this._storageConfig.bucket}/${storageKey}`;
		},

		_extractKeyFromUrl(fileUrl) {
			if (!fileUrl || !this._storageConfig.endpoint || !this._storageConfig.bucket) {
				return null;
			}

			const expectedPrefix = `https://${this._storageConfig.endpoint}/${this._storageConfig.bucket}/`;
			if (!fileUrl.startsWith(expectedPrefix)) {
				return null;
			}

			return fileUrl.slice(expectedPrefix.length);
		},

		_normalizeExpires(value) {
			if (!value) return this.settings.upload.signedUrlExpiresIn;
			const numeric = Number(value);
			if (Number.isNaN(numeric) || numeric <= 0) {
				return this.settings.upload.signedUrlExpiresIn;
			}
			return Math.min(numeric, 60 * 60);
		},

		_redirectToUrl(ctx, url) {
			ctx.meta.$statusCode = 302;
			ctx.meta.$location = url;
			return null;
		},

		_assertStorageConfig() {
			if (!this._storageConfig.bucket) {
				throw new MoleculerError(
					"Storage bucket is not configured",
					500,
					"ERR_STORAGE_CONFIG"
				);
			}
			if (!this._storageConfig.keyId || !this._storageConfig.appKey) {
				throw new MoleculerError(
					"Storage credentials are not configured",
					500,
					"ERR_STORAGE_CONFIG"
				);
			}
		},

		async _logAudit(ctx, payload) {
			try {
				await ctx.call("audits.log", {
					entityType: payload.entityType,
					entityId: payload.entityId,
					action: payload.action,
					userId: ctx.meta.user.id,
					details: payload.details || {}
				});
			} catch (error) {
				this.logger.warn("Audit log failed", error.message);
			}
		}
	}
};

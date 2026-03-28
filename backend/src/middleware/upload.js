import fs from "fs";
import path from "path";
import multer from "multer";

const uploadsRoot = path.resolve(process.cwd(), "uploads");

const ensureDir = (folder) => {
  const target = path.join(uploadsRoot, folder);
  fs.mkdirSync(target, { recursive: true });
  return target;
};

const buildStorage = (folder) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, ensureDir(folder));
    },
    filename: (_req, file, cb) => {
      const safeBase = path
        .basename(file.originalname)
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${safeBase}`);
    }
  });

const fileFilter = (_req, file, cb) => {
  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp"
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error("Unsupported file type. Use PDF, JPG, PNG, or WEBP."));
};

export const createUploader = (folder) =>
  multer({
    storage: buildStorage(folder),
    limits: {
      fileSize: 5 * 1024 * 1024
    },
    fileFilter
  });

export const toPublicUploadPath = (file) => {
  const normalizedPath = file.path.split(path.sep).join("/");
  const uploadsIndex = normalizedPath.lastIndexOf("/uploads/");
  if (uploadsIndex >= 0) {
    return normalizedPath.slice(uploadsIndex);
  }
  return `/uploads/${file.filename}`;
};

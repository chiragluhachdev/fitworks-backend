import express, { Request, Response } from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary";

const router = express.Router();

// Configure multer memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Accept images, pdfs, docs
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPG, PNG, WEBP, PDF, and DOC files are allowed."));
    }
  },
});

// Single file upload to Cloudinary
router.post("/", upload.single("file"), async (req: Request, res: Response): Promise<any> => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const folder = (req.body.folder as string) || "fitworks";
    const resourceType = req.file.mimetype.startsWith("image/") ? "image" : "auto";

    // Upload stream to Cloudinary
    const uploadStream = () =>
      new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: resourceType,
          },
          (error, result) => {
            if (error || !result) {
              reject(error || new Error("Cloudinary upload failed"));
            } else {
              resolve({ secure_url: result.secure_url, public_id: result.public_id });
            }
          }
        );
        stream.end(req.file!.buffer);
      });

    const result = await uploadStream();

    return res.status(200).json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      message: "File uploaded successfully to Cloudinary",
    });
  } catch (error: any) {
    console.error("Cloudinary Upload Error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to upload file to Cloudinary",
    });
  }
});

// Multiple files upload
router.post("/multiple", upload.array("files", 5), async (req: Request, res: Response): Promise<any> => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: "No files uploaded" });
    }

    const folder = (req.body.folder as string) || "fitworks/documents";

    const uploadPromises = files.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const resourceType = file.mimetype.startsWith("image/") ? "image" : "auto";
          const stream = cloudinary.uploader.upload_stream(
            {
              folder,
              resource_type: resourceType,
            },
            (error, result) => {
              if (error || !result) {
                reject(error || new Error("Cloudinary upload failed"));
              } else {
                resolve(result.secure_url);
              }
            }
          );
          stream.end(file.buffer);
        })
    );

    const urls = await Promise.all(uploadPromises);

    return res.status(200).json({
      success: true,
      urls,
      message: "Files uploaded successfully to Cloudinary",
    });
  } catch (error: any) {
    console.error("Cloudinary Multiple Upload Error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to upload files to Cloudinary",
    });
  }
});

export default router;

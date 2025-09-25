const Group = require("../models/Group");
const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require("../services/cloudinary");
const { BadRequestError, ForbiddenError } = require("../utils/errors");
const fs = require("fs");
const path = require("path");

// Update group profile picture
const updateGroupPhoto = async (req, res) => {
  if (!req.file) {
    throw new BadRequestError("No file was uploaded");
  }

  const { groupId } = req.params;
  const filePath = path.normalize(req.file.path);

  if (!fs.existsSync(filePath)) {
    throw new BadRequestError("Error processing the uploaded file");
  }

  try {
    // Find the group and check if user is an admin
    const group = await Group.findById(groupId);

    if (!group) {
      throw new BadRequestError("Group not found");
    }

    // Check if user is an admin of the group
    const isAdmin = group.admins.some(
      (admin) =>
        admin.toString() === req.user.userId ||
        (admin._id && admin._id.toString() === req.user.userId)
    );

    if (!isAdmin) {
      throw new ForbiddenError("Only group admins can update the group photo");
    }

    const oldPhotoUrl = group.photo;
    let newPhotoUrl;

    try {
      // Upload the new photo to Cloudinary
      const result = await uploadToCloudinary(filePath, "group-photos");

      if (!result?.secure_url) {
        throw new Error("Failed to upload image to Cloudinary");
      }

      newPhotoUrl = result.secure_url;

      // Update the group's photo
      group.photo = newPhotoUrl;
      await group.save();

      // If there was an old photo, delete it from Cloudinary
      if (oldPhotoUrl) {
        await deleteFromCloudinary(oldPhotoUrl);
      }

      // Emit socket event to notify all group members
      const io = req.app.get("io");
      if (io) {
        io.to(`group_${groupId}`).emit("group:photoUpdated", {
          groupId: group._id,
          photoUrl: newPhotoUrl,
          updatedBy: req.user.userId,
          updatedAt: new Date(),
        });
      }

      res.json({
        success: true,
        data: {
          photoUrl: newPhotoUrl,
        },
      });
    } catch (error) {
      if (newPhotoUrl) {
        try {
          await deleteFromCloudinary(newPhotoUrl);
        } catch (cleanupError) {
          console.error("Error cleaning up failed upload:", cleanupError);
        }
      }
      throw error;
    }
  } catch (error) {
    console.error("Error updating group photo:", error);
    throw error;
  } finally {
    // Clean up the temporary file
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.error("Error during file cleanup:", cleanupError);
      }
    }
  }
};

module.exports = {
  updateGroupPhoto,
};

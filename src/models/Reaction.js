const mongoose = require("mongoose");

const reactionSchema = new mongoose.Schema(
  {
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      required: [true, "Message is required"],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    emoji: {
      type: String,
      required: [true, "Emoji is required"],
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Prevent duplicate reactions from the same user on the same message
reactionSchema.index({ message: 1, user: 1, emoji: 1 }, { unique: true });

// Virtual for user details
reactionSchema.virtual("userDetails", {
  ref: "User",
  localField: "user",
  foreignField: "_id",
  justOne: true,
  select: "username profilePicture",
});

const Reaction = mongoose.model("Reaction", reactionSchema);

module.exports = Reaction;

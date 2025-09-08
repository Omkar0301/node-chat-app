const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Group name is required"],
      trim: true,
      maxlength: [50, "Group name cannot be longer than 50 characters"],
    },
    description: {
      type: String,
      maxlength: [500, "Description cannot be longer than 500 characters"],
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    photo: {
      type: String,
      default: "",
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Add admin as a member if not already included
groupSchema.pre("save", function (next) {
  if (this.isNew && !this.members.includes(this.createdBy)) {
    this.members.push(this.createdBy);
  }

  if (this.isNew && !this.admins.includes(this.createdBy)) {
    this.admins.push(this.createdBy);
  }

  next();
});

// Virtual for group messages
groupSchema.virtual("messages", {
  ref: "Message",
  localField: "_id",
  foreignField: "group",
  justOne: false,
});

// Indexes
groupSchema.index({ name: "text", description: "text" });
groupSchema.index({ members: 1 });

const Group = mongoose.model("Group", groupSchema);

module.exports = Group;

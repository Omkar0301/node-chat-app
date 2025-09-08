const { validationResult } = require("express-validator");
const { BadRequestError } = require("./errors");

/**
 * Validates the request against validation rules
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @throws {BadRequestError} If validation fails
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => ({
      field: error.param,
      message: error.msg,
    }));

    throw new BadRequestError("Validation failed", errorMessages);
  }

  next();
};

/**
 * Validates a single field value against a schema
 * @param {*} value - The value to validate
 * @param {Object} schema - Joi validation schema
 * @returns {Object} { isValid: boolean, error: string }
 */
const validateField = (value, schema) => {
  const { error } = schema.validate(value);
  return {
    isValid: !error,
    error: error ? error.details[0].message : null,
  };
};

/**
 * Sanitizes input data to prevent XSS attacks
 * @param {string} input - The input string to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeInput = (input) => {
  if (typeof input !== "string") return input;

  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
};

/**
 * Sanitizes request body, query, and params
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const sanitizeRequest = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    Object.keys(req.body).forEach((key) => {
      if (typeof req.body[key] === "string") {
        req.body[key] = sanitizeInput(req.body[key]);
      }
    });
  }

  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      if (typeof req.query[key] === "string") {
        req.query[key] = sanitizeInput(req.query[key]);
      }
    });
  }

  // Sanitize route parameters
  if (req.params) {
    Object.keys(req.params).forEach((key) => {
      if (typeof req.params[key] === "string") {
        req.params[key] = sanitizeInput(req.params[key]);
      }
    });
  }

  next();
};

module.exports = {
  validateRequest,
  validateField,
  sanitizeInput,
  sanitizeRequest,
};

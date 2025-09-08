/**
 * Success response handler
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 * @returns {Object} JSON response
 */
const successResponse = (
  res,
  data = null,
  message = "Success",
  statusCode = 200,
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Error response handler
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {string} defaultMessage - Default error message
 * @param {number} defaultStatusCode - Default HTTP status code (default: 500)
 * @returns {Object} JSON response
 */
const errorResponse = (
  res,
  error,
  defaultMessage = "Something went wrong",
  defaultStatusCode = 500,
) => {
  console.error("Error:", error);

  const statusCode = error.statusCode || defaultStatusCode;
  const message = error.message || defaultMessage;

  return res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === "development" ? error.stack : undefined,
  });
};

/**
 * Pagination response handler
 * @param {Object} res - Express response object
 * @param {Array} data - Paginated data
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items
 * @param {string} message - Success message
 * @returns {Object} JSON response
 */
const paginatedResponse = (
  res,
  data,
  page,
  limit,
  total,
  message = "Success",
) => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  return res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      total,
      totalPages,
      currentPage: page,
      itemsPerPage: limit,
      hasNextPage,
      hasPreviousPage,
      nextPage: hasNextPage ? page + 1 : null,
      previousPage: hasPreviousPage ? page - 1 : null,
    },
  });
};

module.exports = {
  successResponse,
  errorResponse,
  paginatedResponse,
};

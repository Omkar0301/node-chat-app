# Real-time Chat Application

A feature-rich, real-time chat application built with Node.js, Express, Socket.IO, and MongoDB. This application provides both direct messaging and group chat capabilities with user authentication, online status, and message delivery status.

## Features

- **User Authentication**
  - Register with email and password
  - Login with JWT authentication
  - Refresh tokens for secure session management
  - Password hashing with bcrypt

- **Real-time Messaging**
  - One-to-one private messaging
  - Group chats with multiple participants
  - Typing indicators
  - Message delivery status (sent, delivered, read)
  - Online/offline status
  - Message history

- **User Management**
  - User profiles with avatars
  - Online/offline status
  - Last seen timestamp
  - Search for users

- **Group Chats**
  - Create and manage groups
  - Add/remove members
  - Group admin controls
  - Group information and settings

- **Media Sharing**
  - Image and file sharing
  - File type validation
  - File size limits

- **Security**
  - Input validation and sanitization
  - Rate limiting
  - Helmet for secure HTTP headers
  - CSRF protection
  - XSS prevention

## Tech Stack

- **Backend**
  - Node.js
  - Express.js
  - Socket.IO
  - MongoDB with Mongoose
  - JWT for authentication

- **Utilities**
  - Winston for logging
  - Multer for file uploads
  - Cloudinary for media storage
  - Validator for input validation

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/chat-app.git
   cd chat-app
   ```

2. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

3. Create a `.env` file in the root directory and add the following environment variables:

   ```env
   NODE_ENV=development
   PORT=3001
   MONGODB_URI=mongodb://localhost:27017/chat-app
   JWT_SECRET=your_jwt_secret_key
   JWT_ACCESS_EXPIRATION=15m
   JWT_REFRESH_SECRET=your_refresh_token_secret
   JWT_REFRESH_EXPIRATION=7d
   CLIENT_URL=http://localhost:3000
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   ```

4. Start the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. The server will be running at `http://localhost:3001`

## Project Structure

```
src/
├── config/           # Configuration files
├── controllers/      # Route controllers (request handlers)
├── middleware/       # Custom middleware
├── models/           # Mongoose models
├── routes/           # Route definitions
├── services/         # Business logic and external services
├── sockets/          # Socket.IO event handlers
├── utils/            # Utility classes and functions
└── server.js         # Application entry point
```

## API Documentation

API documentation is available at `/api-docs` when running in development mode.

## Environment Variables

| Variable               | Description                      | Default                              |
| ---------------------- | -------------------------------- | ------------------------------------ |
| NODE_ENV               | Application environment          | `development`                        |
| PORT                   | Port to run the server           | `3001`                               |
| MONGODB_URI            | MongoDB connection string        | `mongodb://localhost:27017/chat-app` |
| JWT_SECRET             | Secret for JWT signing           | -                                    |
| JWT_ACCESS_EXPIRATION  | JWT access token expiration time | `15m`                                |
| JWT_REFRESH_SECRET     | Secret for refresh token signing | -                                    |
| JWT_REFRESH_EXPIRATION | Refresh token expiration time    | `7d`                                 |
| CLIENT_URL             | URL of the frontend application  | `http://localhost:3000`              |
| CLOUDINARY_CLOUD_NAME  | Cloudinary cloud name            | -                                    |
| CLOUDINARY_API_KEY     | Cloudinary API key               | -                                    |
| CLOUDINARY_API_SECRET  | Cloudinary API secret            | -                                    |

## Testing

To run tests:

```bash
npm test
# or
yarn test
```

## Linting

To check for linting errors:

```bash
npm run lint
# or
yarn lint
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Express](https://expressjs.com/)
- [Socket.IO](https://socket.io/)
- [MongoDB](https://www.mongodb.com/)
- [Mongoose](https://mongoosejs.com/)
- [JWT](https://jwt.io/)
- [Winston](https://github.com/winstonjs/winston)

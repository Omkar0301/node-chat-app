# Socket.IO Events Documentation

## Connection

### Client to Server

- **Event:** `connection`
  - **Description:** Client connects to the server
  - **Auth Required:** Yes (via query token)
  - **Example:**
    ```javascript
    const socket = io("http://localhost:3001", {
      query: { token: "your_jwt_token" },
    });
    ```

## Authentication

### Client to Server

- **Event:** `authenticate`
  - **Description:** Authenticate socket connection
  - **Auth Required:** Yes (via token in data)
  - **Data:**
    ```json
    {
      "token": "jwt_token_here"
    }
    ```

## User Events

### Server to Client

- **Event:** `user:status`
  - **Description:** Notify about user's online/offline status
  - **Data:**
    ```json
    {
      "userId": "user_id_here",
      "isOnline": true,
      "lastSeen": "2023-01-01T12:00:00Z"
    }
    ```

## Direct Messages

### Client to Server

- **Event:** `message:send`
  - **Description:** Send a direct message
  - **Auth Required:** Yes
  - **Data:**
    ```json
    {
      "to": "recipient_id",
      "content": "Hello!",
      "type": "text"
    }
    ```
  - **Acknowledgement:**
    ```javascript
    socket.emit("message:send", messageData, (response) => {
      console.log("Message sent:", response);
    });
    ```

### Server to Client

- **Event:** `message:received`
  - **Description:** Receive a new message
  - **Data:**
    ```json
    {
      "id": "message_id",
      "from": "sender_id",
      "to": "recipient_id",
      "content": "Hello!",
      "createdAt": "2023-01-01T12:00:00Z"
    }
    ```

## Group Messages

### Client to Server

- **Event:** `group:message:send`
  - **Description:** Send a message to a group
  - **Auth Required:** Yes
  - **Data:**
    ```json
    {
      "groupId": "group_id_here",
      "content": "Hello group!"
    }
    ```

## Typing Indicators

### Client to Server

- **Event:** `typing:start`
  - **Description:** Notify that user is typing
  - **Data:**
    ```json
    {
      "to": "recipient_id_or_group_id",
      "isGroup": false
    }
    ```

- **Event:** `typing:stop`
  - **Description:** Notify that user stopped typing
  - **Data:** Same as `typing:start`

### Server to Client

- **Event:** `user:typing`
  - **Description:** Notify that a user is typing
  - **Data:**
    ```json
    {
      "from": "user_id",
      "isTyping": true,
      "isGroup": false,
      "groupId": null
    }
    ```

## Message Status

### Server to Client

- **Event:** `message:status`
  - **Description:** Message delivery/read status update
  - **Data:**
    ```json
    {
      "messageId": "message_id",
      "status": "delivered" // or "read"
    }
    ```

## Error Handling

### Server to Client

- **Event:** `error`
  - **Description:** Error notification
  - **Data:**
    ```json
    {
      "code": "AUTH_ERROR",
      "message": "Authentication failed"
    }
    ```

## Usage Example

```javascript
// Connect with JWT token
const socket = io("http://localhost:3001", {
  query: { token: "your_jwt_token" },
});

// Listen for new messages
socket.on("message:received", (message) => {
  console.log("New message:", message);
});

// Send a message
socket.emit(
  "message:send",
  {
    to: "recipient_id",
    content: "Hello!",
    type: "text",
  },
  (response) => {
    console.log("Message sent:", response);
  },
);

// Handle typing indicator
let typingTimer;
document.getElementById("message-input").addEventListener("input", () => {
  socket.emit("typing:start", { to: "recipient_id" });

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit("typing:stop", { to: "recipient_id" });
  }, 1000);
});

// Handle disconnection
socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});
```

## Error Codes

| Code          | Description           |
| ------------- | --------------------- |
| AUTH_ERROR    | Authentication failed |
| INVALID_INPUT | Invalid input data    |
| UNAUTHORIZED  | Not authorized        |
| NOT_FOUND     | Resource not found    |
| RATE_LIMITED  | Too many requests     |
| SERVER_ERROR  | Internal server error |

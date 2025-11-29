# Project File Structure

Complete directory structure of the WebRTC Full-Stack Chat Application.

```
webRTC/
│
├── README.md                          # Main documentation
├── QUICKSTART.md                      # Quick setup guide
├── FEATURES.md                        # Detailed features documentation
├── TROUBLESHOOTING.md                 # Common issues and solutions
├── setup.sh                           # Automated setup script
├── package.json                       # Root package.json with convenience scripts
│
├── backend/                           # Node.js + Express + MongoDB backend
│   ├── config/
│   │   └── db.js                      # MongoDB connection configuration
│   │
│   ├── models/
│   │   ├── User.js                    # User model (username, email, password)
│   │   ├── Room.js                    # Room model (name, description, participants)
│   │   └── Message.js                 # Message model (content, sender, timestamp)
│   │
│   ├── routes/
│   │   ├── auth.js                    # Authentication routes (signup, login)
│   │   └── rooms.js                   # Room routes (get rooms, create room, get messages)
│   │
│   ├── middleware/
│   │   └── auth.js                    # JWT authentication middleware
│   │
│   ├── socket/
│   │   └── index.js                   # Socket.IO server and WebRTC signaling
│   │
│   ├── server.js                      # Express server entry point
│   ├── package.json                   # Backend dependencies
│   ├── .env.example                   # Environment variables template
│   ├── .env                           # Environment variables (created during setup)
│   ├── .gitignore                     # Git ignore file
│   ├── README.md                      # Backend documentation
│   └── node_modules/                  # Backend dependencies (installed)
│
└── frontend/                          # Next.js + React frontend
    ├── pages/
    │   ├── _app.js                    # App wrapper with AuthProvider
    │   ├── _document.js               # Custom HTML document
    │   ├── index.js                   # Landing page (redirects to login/rooms)
    │   ├── login.js                   # Login page
    │   ├── signup.js                  # Signup page
    │   ├── rooms.js                   # Room list page
    │   └── chat/
    │       └── [id].js                # Dynamic chat room page with WebRTC
    │
    ├── contexts/
    │   └── AuthContext.js             # Authentication context provider
    │
    ├── utils/
    │   ├── api.js                     # Axios API client with interceptors
    │   ├── socket.js                  # Socket.IO client utilities
    │   └── webrtc.js                  # WebRTC manager class
    │
    ├── styles/
    │   └── globals.css                # Global styles and theme colors
    │
    ├── public/                        # Static assets
    │   ├── favicon.ico                # (Next.js default)
    │   └── vercel.svg                 # (Next.js default)
    │
    ├── package.json                   # Frontend dependencies
    ├── next.config.js                 # Next.js configuration
    ├── tailwind.config.js             # Tailwind CSS configuration
    ├── postcss.config.js              # PostCSS configuration
    ├── .env.local                     # Frontend environment variables
    ├── .gitignore                     # Git ignore file
    ├── README.md                      # Frontend documentation
    ├── node_modules/                  # Frontend dependencies (installed)
    └── .next/                         # Next.js build output (generated)
```

## File Count Summary

### Backend (10 source files)

- Configuration: 1 file
- Models: 3 files
- Routes: 2 files
- Middleware: 1 file
- Socket: 1 file
- Server: 1 file
- Config files: 3 files

### Frontend (14 source files)

- Pages: 6 files
- Contexts: 1 file
- Utils: 3 files
- Styles: 1 file
- Config files: 5 files

### Documentation (5 files)

- README.md
- QUICKSTART.md
- FEATURES.md
- TROUBLESHOOTING.md
- Backend/Frontend READMEs

### Total: ~40 files (excluding node_modules and generated files)

## Key File Descriptions

### Backend Files

**server.js** (Entry Point)

- Express server setup
- Socket.IO initialization
- Routes registration
- MongoDB connection
- CORS configuration

**config/db.js**

- MongoDB connection logic
- Error handling
- Connection logging

**models/User.js**

- User schema definition
- Password hashing middleware
- Password comparison method

**models/Room.js**

- Room schema definition
- Participant tracking
- Creator reference

**models/Message.js**

- Message schema definition
- Room and sender references
- Timestamp tracking

**routes/auth.js**

- POST /api/auth/signup - User registration
- POST /api/auth/login - User authentication
- JWT token generation

**routes/rooms.js**

- GET /api/rooms - List all rooms
- POST /api/rooms - Create new room
- GET /api/rooms/:id/messages - Get room messages

**middleware/auth.js**

- JWT token verification
- Request authentication
- User ID extraction

**socket/index.js**

- Socket.IO authentication
- Room join/leave handling
- Message broadcasting
- WebRTC signaling (offer/answer/ICE)
- Call management

### Frontend Files

**pages/\_app.js**

- AuthProvider wrapper
- Global styles import
- App-wide configuration

**pages/index.js**

- Landing page
- Authentication check
- Redirect logic

**pages/login.js**

- Login form UI
- Form validation
- Authentication API call
- Error handling

**pages/signup.js**

- Signup form UI
- Password confirmation
- Form validation
- Account creation

**pages/rooms.js**

- Room list display
- Create room modal
- Room navigation
- Logout functionality

**pages/chat/[id].js**

- Chat interface
- Message list
- WebRTC video/audio
- Call controls
- Socket.IO integration

**contexts/AuthContext.js**

- Authentication state management
- Login/signup/logout functions
- Token persistence
- Socket.IO initialization

**utils/api.js**

- Axios instance configuration
- Request/response interceptors
- API endpoint functions
- Token injection

**utils/socket.js**

- Socket.IO connection
- Event listeners
- Room management functions
- Message sending

**utils/webrtc.js**

- WebRTCManager class
- Peer connection management
- Media stream handling
- Signaling functions

**styles/globals.css**

- Tailwind directives
- Custom CSS
- Theme colors
- Scrollbar styling

### Configuration Files

**backend/package.json**

- Dependencies: express, mongoose, socket.io, jwt, bcryptjs
- Scripts: dev (nodemon), start

**frontend/package.json**

- Dependencies: react, next, socket.io-client, axios, tailwind
- Scripts: dev, build, start

**frontend/tailwind.config.js**

- Theme colors (silver, blue, purple)
- Dark mode configuration
- Content paths

**frontend/next.config.js**

- Environment variables
- React strict mode

**backend/.env**

- PORT=5000
- MONGODB_URI
- JWT_SECRET
- NODE_ENV

**frontend/.env.local**

- NEXT_PUBLIC_API_URL=http://localhost:5000

## Installation Impact

After running `npm install` in both directories:

**Backend node_modules:**

- ~200 MB
- ~50 packages (with dependencies)

**Frontend node_modules:**

- ~350 MB
- ~300 packages (with dependencies)

**Total project size:** ~600 MB (including dependencies)

## Generated Files (Not in Git)

### Backend

- `node_modules/` - Dependencies
- `.env` - Environment variables

### Frontend

- `node_modules/` - Dependencies
- `.next/` - Build output
- `.env.local` - Environment variables

## Git Ignored Files

Both `.gitignore` files exclude:

- `node_modules/`
- `.env` / `.env.local`
- Log files
- OS files (.DS_Store)
- Build outputs

## Scripts Available

### Root Directory

```bash
npm run setup              # Run setup.sh script
npm run install-all        # Install all dependencies
npm run dev:backend        # Start backend dev server
npm run dev:frontend       # Start frontend dev server
npm run start:backend      # Start backend production
npm run start:frontend     # Start frontend production
npm run build:frontend     # Build frontend for production
```

### Backend

```bash
npm run dev                # Start with nodemon
npm start                  # Start production server
```

### Frontend

```bash
npm run dev                # Start development server
npm run build              # Build for production
npm start                  # Start production server
npm run lint               # Run ESLint
```

## Development Workflow

1. **Initial Setup:**

   ```bash
   ./setup.sh
   # or
   npm run install-all
   ```

2. **Start Development:**

   ```bash
   # Terminal 1
   npm run dev:backend

   # Terminal 2
   npm run dev:frontend
   ```

3. **Access Application:**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:5000
   - MongoDB: mongodb://localhost:27017

---

**Complete project ready for development and deployment! 🚀**

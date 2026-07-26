# ChatWidget Component

A modern, glassmorphic chat widget powered by OpenAI ChatKit for the Physical AI & Humanoid Robotics book.

## Features

- ✅ **Glassmorphism Design**: Modern frosted glass effect with backdrop blur
- ✅ **Theme Adaptive**: Automatically adapts to light/dark mode
- ✅ **Mobile Responsive**: Full-screen overlay on mobile devices
- ✅ **Text Selection**: "Ask AI about this" functionality for highlighted text
- ✅ **Session Persistence**: Chat history saved in LocalStorage
- ✅ **Streaming Responses**: Real-time AI responses via ChatKit

## Architecture

```
src/components/ChatWidget/
├── index.tsx                 # Main ChatWidget component
├── ChatButton.tsx           # Floating action button
├── hooks/
│   ├── useSessionPersistence.ts  # LocalStorage management
│   ├── useChatKitSession.ts      # ChatKit session handling
│   └── useTextSelection.ts       # Text selection detection (future)
├── types/
│   └── index.ts               # TypeScript interfaces
└── README.md                 # This file
```

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file in the project root:

```env
# OpenAI API Key (required)
OPENAI_API_KEY=your_openai_api_key_here

# ChatKit Session Endpoint
NEXT_PUBLIC_CHATKIT_SESSION_ENDPOINT=http://localhost:7860/api/chatkit/session

# RAG Backend Endpoint (for book content)
CHAT_API_ENDPOINT=http://localhost:7860
```

### 2. Backend Setup

Ensure the FastAPI backend is running with the `/api/chatkit/session` endpoint:

```bash
cd backend
uv run uvicorn main:app --host 0.0.0.0 --port 7860 --reload
```

### 3. Frontend Development

Start the Docusaurus development server:

```bash
npm start
```

The chat widget will appear in the bottom-right corner of all pages.

## Customization

### Theming

The widget automatically uses Docusaurus CSS variables:

```css
--ifm-color-primary: #0d9488; /* Primary accent color */
--ifm-background-surface-color: #ffffff; /* Panel background */
--ifm-border-color: #e5e7eb; /* Border color */
--ifm-font-family-base: system-ui, sans-serif; /* Font */
```

### Glassmorphism Effect

The glassmorphism styles are defined in `src/styles/glassmorphism.css`:

- `backdrop-filter: blur(20px)` - Frosted glass effect
- `background: rgba(255, 255, 255, 0.08)` - Semi-transparent background
- `border: 1px solid rgba(255, 255, 255, 0.2)` - Glass border

## Future Enhancements

- [ ] Text selection with "Ask AI about this" popover
- [ ] Voice input/output support
- [ ] File upload for code analysis
- [ ] Multi-language support
- [ ] Custom prompt templates
- [ ] Chat history export

## Troubleshooting

### ChatKit Authentication Error

Ensure:
1. OpenAI API key is set in backend `.env`
2. Backend server is running on port 7860
3. CORS is properly configured for your domain

### Glassmorphism Not Working

Check browser compatibility:
- Chrome 76+
- Firefox 103+
- Safari 14+
- Edge 79+

Fallback styles are provided for unsupported browsers.

### Mobile Issues

The widget automatically switches to full-screen mode on devices < 768px width. Ensure viewport meta tag is set:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```
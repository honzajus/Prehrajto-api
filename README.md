# Video Search API

Local REST API built with TypeScript for searching videos.

## Start

npm install
npm run dev

Server:

http://localhost:3000

## API

### Search

http://localhost:3000/api/search?title=SamDoma

Open the URL directly in your browser.

### Example

http://localhost:3000/api/search?title=The%20Boys

### Health Check

http://localhost:3000/health

## Parameters

### title

Search for a movie or series:

http://localhost:3000/api/search?title=SamDoma

http://localhost:3000/api/search?title=The%20Boys

### quality

Select video quality:

http://localhost:3000/api/search?title=The%20Boys&quality=720

http://localhost:3000/api/search?title=The%20Boys&quality=1080

## Example Response - Sam Doma

Request:

http://localhost:3000/api/search?title=SamDoma

Response:

{
  "success": true,
  "result": {
    "series": null,
    "season": null,
    "episode": null,
    "title": "Sám doma 1 (1990) - CZ Dabing.",
    "videoId": "2d8ceac1da10cee9",
    "pageUrl": "https://prehraj.to/sam-doma-1-1990-cz-dabing-top2026/2d8ceac1da10cee9",
    "streams": [
      {
        "quality": "1080p",
        "format": "mp4",
        "url": "AUTHORIZED_STREAM_URL"
      }
    ],
    "subtitles": [],
    "duration": "N/A"
  }
}

## Example Response - The Boys

{
  "success": true,
  "result": {
    "series": "The Boys",
    "season": 5,
    "episode": 8,
    "title": "Kosti a krev",
    "videoId": "59d39f090e644a6b",
    "pageUrl": "https://prehraj.to/...",
    "streams": [
      {
        "quality": "720p",
        "format": "mp4",
        "url": "AUTHORIZED_STREAM_URL"
      }
    ],
    "subtitles": [
      {
        "language": "ENG",
        "id": "9890887"
      },
      {
        "language": "CZE",
        "id": "9890888"
      }
    ],
    "duration": "1:06:45"
  }
}

## Project Structure

video-search-api/
├── src/
│   ├── parsers/
│   │   ├── searchParser.ts
│   │   └── videoParser.ts
│   ├── routes/
│   │   ├── health.ts
│   │   └── search.ts
│   ├── services/
│   │   └── prehrajto.ts
│   ├── types.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── README.md

## Build

npm run build

## Production

npm start

## Test

curl "http://localhost:3000/api/search?title=SamDoma"


## Browser

Open:

http://localhost:3000/api/search?title=SamDoma

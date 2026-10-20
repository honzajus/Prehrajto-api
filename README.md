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

### season, episode

Specific episode of a series (the code can also be part of the title):

http://localhost:3000/api/search?title=The%20Boys&season=5&episode=8

http://localhost:3000/api/search?title=The%20Boys%20S05E08

### type

`movie` ignores series episodes, `series` without season/episode returns S01E01:

http://localhost:3000/api/search?title=Inception&type=movie

### all

Return every playable upload instead of the first one:

http://localhost:3000/api/search?title=The%20Boys&season=5&episode=8&all=1

## Series - list of episodes

All seasons/episodes found:

http://localhost:3000/api/series?title=The%20Boys

Episodes of one season (each with its uploads):

http://localhost:3000/api/series?title=The%20Boys&season=5

The listing only covers the first page of prehraj.to results (other pages require login), so it can be incomplete. A missing episode can still be loaded directly via `season` + `episode`.

## Video by URL

http://localhost:3000/api/video?url=https://prehraj.to/the-boys-s05e08-cz-dabing/a9e37e7f85b16929

## Rate limit

prehraj.to allows only about 5 searches per minute per IP. Searches are cached for 15 minutes; when the limit is hit the API responds with `429`.

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

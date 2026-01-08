# Skill: Publish to Zenbin

Publish HTML pages to Zenbin for sharing. Each page gets a permanent unique URL.

## Base URL

```
https://zenbin.onrender.com
```

## Quick Reference

### Publish a Page

```bash
curl -X POST "https://zenbin.onrender.com/v1/pages/{id}" \
  -H "Content-Type: application/json" \
  -d '{
    "encoding": "base64",
    "html": "<base64-encoded-html>",
    "title": "Page Title"
  }'
```

### Response

```json
{
  "id": "my-page",
  "url": "https://zenbin.onrender.com/p/my-page",
  "raw_url": "https://zenbin.onrender.com/p/my-page/raw",
  "etag": "..."
}
```

## Step-by-Step Publishing

### 1. Create HTML File

Save your content as a complete HTML document:

```bash
cat << 'EOF' > /tmp/my-page.html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Page Title</title>
  <style>
    /* Your styles here */
  </style>
</head>
<body>
  <!-- Your content here -->
</body>
</html>
EOF
```

### 2. Base64 Encode

```bash
base64 -i /tmp/my-page.html | tr -d '\n' > /tmp/my-page-b64.txt
```

### 3. Publish

```bash
curl -X POST "https://zenbin.onrender.com/v1/pages/my-unique-id" \
  -H "Content-Type: application/json" \
  -d "{\"encoding\": \"base64\", \"html\": \"$(cat /tmp/my-page-b64.txt)\", \"title\": \"My Page Title\"}"
```

## Recommended HTML Template

Use this template for blog posts and articles:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{TITLE}}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      line-height: 1.8;
      max-width: 680px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
      background: #fafafa;
      color: #333;
    }
    h1 {
      font-size: 2.2rem;
      margin-bottom: 0.5rem;
      color: #1a1a1a;
      line-height: 1.3;
    }
    h2 {
      font-size: 1.5rem;
      margin-top: 2rem;
      color: #1a1a1a;
    }
    .subtitle {
      font-style: italic;
      color: #666;
      margin-bottom: 2rem;
      font-size: 1.1rem;
    }
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 2rem 0;
    }
    p {
      margin-bottom: 1.5rem;
      text-align: justify;
    }
    em { font-style: italic; }
    strong { font-weight: bold; }
    blockquote {
      margin: 1.5rem 0;
      padding: 1rem 1.5rem;
      background: #f5f5f5;
      border-left: 4px solid #4a9eff;
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 0.95rem;
    }
    code {
      font-family: 'SF Mono', Consolas, monospace;
      background: #f0f0f0;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-size: 0.9rem;
    }
    pre {
      background: #2d2d2d;
      color: #f8f8f2;
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.9rem;
    }
    pre code {
      background: none;
      padding: 0;
    }
    .highlight {
      background: #e8f4e8;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      margin: 1.5rem 0;
    }
    .cta {
      text-align: center;
      margin-top: 3rem;
      padding: 2rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      color: white;
    }
    .cta a {
      color: white;
      font-weight: bold;
      font-size: 1.2rem;
    }
    .meta {
      font-size: 0.85rem;
      color: #888;
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #eee;
    }
    a { color: #4a9eff; }
    a:hover { text-decoration: underline; }
    ul, ol {
      margin-bottom: 1.5rem;
      padding-left: 1.5rem;
    }
    li { margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <h1>{{TITLE}}</h1>
  <p class="subtitle">{{SUBTITLE}}</p>
  
  <hr>

  {{CONTENT}}

  <p class="meta">{{META}}</p>
</body>
</html>
```

## Request Body Fields

| Field | Required | Description |
|-------|----------|-------------|
| `html` | Yes | HTML content (plain text or base64-encoded) |
| `encoding` | No | `"utf-8"` (default) or `"base64"` |
| `title` | No | Page title (metadata only) |
| `content_type` | No | Content-Type header (default: `text/html; charset=utf-8`) |
| `auth` | No | Authentication: `{ password?: string, urlToken?: boolean }` |

## Page ID Rules

- Allowed characters: `A-Z`, `a-z`, `0-9`, `.`, `_`, `-`
- Maximum length: 128 characters
- IDs are permanent and cannot be overwritten
- Choose descriptive, unique IDs (e.g., `morning-everything-changed`, `report-2024-01-15`)

## Limits

- Maximum HTML size: 512KB
- Maximum ID length: 128 characters

## Optional: Password Protection

```bash
curl -X POST "https://zenbin.onrender.com/v1/pages/secret-page" \
  -H "Content-Type: application/json" \
  -d '{
    "encoding": "base64",
    "html": "<base64-content>",
    "auth": {
      "password": "minimum-8-chars"
    }
  }'
```

## Optional: Secret URL Token

```bash
curl -X POST "https://zenbin.onrender.com/v1/pages/shared-page" \
  -H "Content-Type: application/json" \
  -d '{
    "encoding": "base64",
    "html": "<base64-content>",
    "auth": {
      "urlToken": true
    }
  }'
```

Response includes `secret_url` for sharing.

## Viewing Published Pages

- **Rendered**: `https://zenbin.onrender.com/p/{id}`
- **Raw HTML**: `https://zenbin.onrender.com/p/{id}/raw`

## Complete Example

```bash
# 1. Create HTML content
cat << 'HTMLEOF' > /tmp/example.html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hello World</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      max-width: 600px;
      margin: 2rem auto;
      padding: 1rem;
    }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>Hello World</h1>
  <p>This is a test page published to Zenbin.</p>
</body>
</html>
HTMLEOF

# 2. Encode and publish
base64 -i /tmp/example.html | tr -d '\n' > /tmp/example-b64.txt

curl -X POST "https://zenbin.onrender.com/v1/pages/hello-world-test" \
  -H "Content-Type: application/json" \
  -d "{\"encoding\": \"base64\", \"html\": \"$(cat /tmp/example-b64.txt)\", \"title\": \"Hello World\"}"

# 3. Response will include the URL
# {"id":"hello-world-test","url":"https://zenbin.onrender.com/p/hello-world-test",...}
```

## Error Handling

**409 Conflict** - ID already taken:
```json
{"error": "Page ID \"my-page\" is already taken"}
```
Solution: Choose a different unique ID.

## API Documentation

Full API docs available at:
```
https://zenbin.onrender.com/api/agent
```

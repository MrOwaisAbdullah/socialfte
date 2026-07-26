# Brevo API Endpoints Reference

Complete reference for Brevo Email API endpoints.

## Base URL

```
https://api.brevo.com/v3
```

## Authentication

All requests require the `api-key` header:

```http
api-key: xkeysib-xxxxxxxxxxxxxxxxx
content-type: application/json
accept: application/json
```

---

## Transactional Email Endpoints

### Send Transactional Email

**Endpoint:** `POST /smtp/email`

**Description:** Send a transactional email with HTML content or using a template.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sender` | object | Yes* | `{email, name}` - Sender info (required if not using templateId) |
| `to` | array | Yes* | `[{email, name}]` - Recipients (required if not using messageVersions) |
| `cc` | array | No | CC recipients |
| `bcc` | array | No | BCC recipients |
| `replyTo` | object | No | `{email, name}` - Reply-to address |
| `subject` | string | Yes* | Email subject (required if not using templateId) |
| `htmlContent` | string | No | HTML body (ignored if templateId is provided) |
| `textContent` | string | No | Plain text body (ignored if templateId is provided) |
| `templateId` | integer | No | Template ID to use |
| `params` | object | No | Template variables `{{params.key}}` |
| `attachment` | array | No | File attachments (max 4MB each) |
| `scheduledAt` | string | No | ISO 8601 datetime for scheduling |
| `tags` | array | No | Email tags for categorization |

**Response:** `200 OK`

```json
{
  "messageId": "<20230101000000.abc@example.com>"
}
```

---

### Create Email Template

**Endpoint:** `POST /smtp/templates`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `templateName` | string | Yes | Name of the template |
| `subject` | string | No | Default subject line |
| `htmlContent` | string | No | HTML content with `{{params}}` variables |
| `textContent` | string | No | Plain text fallback |
| `sender` | object | No | Default sender `{email, name}` |
| `replyTo` | string | No | Default reply-to address |
| `toField` | string | No | Default recipient field |
| `isActive` | boolean | No | Whether template is active (default: true) |
| `attachmentUrl` | string | No | Default attachment URL |

**Response:** `201 Created`

```json
{
  "id": 123,
  "message": "Template created successfully"
}
```

---

### Update Email Template

**Endpoint:** `PUT /smtp/templates/{templateId}`

**Path Parameters:**
- `templateId` (integer) - Template ID to update

**Request Body:** Same as Create Template (all fields optional)

**Response:** `204 No Content`

---

### Delete Email Template

**Endpoint:** `DELETE /smtp/templates/{templateId}`

**Path Parameters:**
- `templateId` (integer) - Template ID to delete (must be inactive)

**Response:** `204 No Content`

---

### Get Email Template

**Endpoint:** `GET /smtp/templates/{templateId}`

**Response:** `200 OK`

```json
{
  "id": 123,
  "templateName": "Welcome Email",
  "subject": "Welcome {{params.firstname}}!",
  "htmlContent": "<html>...</html>",
  "isActive": true,
  "createdAt": "2023-01-01T00:00:00Z"
}
```

---

### List Email Templates

**Endpoint:** `GET /smtp/templates`

**Query Parameters:**
- `templateStatus` (string) - Filter by status: `active` or `inactive`
- `limit` (integer) - Number of results (default: 50)
- `offset` (integer) - Pagination offset

**Response:** `200 OK`

```json
{
  "templates": [
    { "id": 123, "templateName": "Welcome Email", "isActive": true },
    { "id": 124, "templateName": "Order Confirmation", "isActive": true }
  ],
  "count": 2
}
```

---

### Send Test Email

**Endpoint:** `POST /smtp/templates/{templateId}/sendTest`

**Request Body:**

```json
{
  "emailTo": ["test1@example.com", "test2@example.com"]
}
```

**Response:** `204 No Content`

---

### Generate Template Preview

**Endpoint:** `POST /smtp/templates/{templateId}/preview`

**Request Body:**

```json
{
  "params": {
    "firstname": "John",
    "order_id": "12345"
  }
}
```

**Response:** `200 OK`

```json
{
  "html": "<html><body>...</body></html>"
}
```

---

## Scheduled and Batch Sending

### Schedule Email

**Endpoint:** `POST /smtp/email`

Include `scheduledAt` in request body:

```json
{
  "sender": {"email": "from@example.com"},
  "to": [{"email": "to@example.com"}],
  "subject": "Scheduled Email",
  "htmlContent": "<p>Hello!</p>",
  "scheduledAt": "2024-01-01T14:30:00+00:00"
}
```

---

### Batch Send with Message Versions

**Endpoint:** `POST /smtp/email`

Use `messageVersions` for personalized batch sending:

```json
{
  "templateId": 42,
  "messageVersions": [
    {
      "to": [{"email": "user1@example.com"}],
      "params": {"name": "User 1", "offer": "20%"}
    },
    {
      "to": [{"email": "user2@example.com"}],
      "params": {"name": "User 2", "offer": "15%"}
    }
  ]
}
```

---

### Delete Scheduled Email

**Endpoint:** `DELETE /smtp/email/{identifier}`

**Path Parameters:**
- `identifier` (string) - `messageId` (single) or `batchId` (batch)

**Response:** `204 No Content`

---

## Error Codes

| Code | Message | Meaning |
|------|---------|---------|
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Invalid API key |
| 402 | Payment Required | Account has insufficient credits |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Brevo internal error |

---

## TypeScript Types

```typescript
interface SendSmtpEmail {
  sender?: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  bcc?: Array<{ email: string; name?: string }>;
  replyTo?: { email: string; name?: string };
  subject?: string;
  htmlContent?: string;
  textContent?: string;
  templateId?: number;
  params?: Record<string, any>;
  attachment?: Array<{
    content?: string; // base64
    url?: string;
    name: string;
  }>;
  scheduledAt?: string; // ISO 8601
  tags?: string[];
  headers?: Record<string, string>;
}

interface CreateSmtpTemplate {
  templateName: string;
  subject?: string;
  htmlContent?: string;
  textContent?: string;
  sender?: { email: string; name?: string };
  replyTo?: string;
  toField?: string;
  isActive?: boolean;
  attachmentUrl?: string;
  tag?: string;
}

interface SendSmtpEmailResponse {
  messageId: string;
  message?: string;
}
```

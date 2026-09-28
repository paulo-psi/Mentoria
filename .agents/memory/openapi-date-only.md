---
name: OpenAPI date-only coercion
description: Generated Zod handling of OpenAPI calendar dates in API request and response schemas
---

OpenAPI `format: date` currently generates Zod `coerce.date()` schemas. This accepts more input formats than strict `YYYY-MM-DD` and converts valid date-only strings into JavaScript `Date` objects.

**Why:** Drizzle date columns use calendar strings, not instants. Accepting locale-style dates or serializing a date-only value as a timestamp makes API behavior ambiguous and can shift dates across time zones.

**How to apply:** For endpoints writing `date(..., { mode: "string" })`, validate the original request string with `z.iso.date()` before persistence. After generated response validation, preserve the original `YYYY-MM-DD` string on the wire rather than returning the coerced `Date`.
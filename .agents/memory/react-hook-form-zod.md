---
name: React Hook Form and Zod
description: Resolver typing for string-valued native controls and numeric API payloads.
---

Keep native form controls string-valued, validate score bounds and identifier formats with Zod, then convert to the generated API input type in an explicit payload mapper.

**Why:** In this workspace, the installed React Hook Form and Zod resolver typings did not reliably carry transformed numeric output through the resolver's generic type, despite the runtime parser transforming values. Modeling transformed output caused type errors across the resolver and controlled fields.

**How to apply:** For forms that submit numeric API fields from HTML selects or inputs, align Zod's resolver output with the string-valued field state and perform numeric conversion in a typed request builder. Only use transformed resolver output if the installed resolver types can express it without unsafe casts.
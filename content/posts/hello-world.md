---
title: "Hello, world"
slug: hello-world
status: draft # draft | published | scheduled (scheduled needs a future published_at)
tags:
  - meta
excerpt: "The first post from a repo-driven blog: written in markdown, versioned in git, published by a workflow."
visibility: public # public | members | paid
# published_at: 2026-08-17T09:00:00Z
# feature_image: ../images/cover.jpg        # local paths are uploaded to Ghost automatically
# feature_image_alt: "A description of the cover"
# feature_image_caption: "Photo credit"
# meta_title: ""
# meta_description: ""
# canonical_url: ""
# email: default-newsletter   # set to send as newsletter when this post first publishes
# email_segment: "all"        # or "status:free" / "status:-free"
---

This post lives in a git repository. When it lands on `main`, a workflow converts
it to HTML, pushes it through Ghost's Admin API, and Ghost renders it with the
Evia theme — date and tags out in the margin, where annotations belong.

## What works out of the box

Everything standard markdown gives you converts cleanly into Ghost's native
cards: **emphasis**, [links](https://ghost.org), lists, and quotes.

> A post is just a file. A blog is just a folder. Everything else is delivery.

Code blocks come through as proper code cards:

```js
const posts = await api.posts.browse({ filter: "tag:hash-repo" });
console.log(`${posts.length} posts under version control`);
```

Local images referenced with a relative path — like
`![alt text](../images/example.png)` — are uploaded to Ghost's CDN on sync and
the URLs are rewritten automatically. Remote `https://` images pass through
untouched.

---

A horizontal rule becomes an asterism in the theme, which is the right way to
end a first post.

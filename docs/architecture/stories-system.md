# Stories System Architecture

## Architecture Diagram

```mermaid
flowchart LR
    subgraph Browser
        Create["/create-story page"]
        Bar["StoriesBar (on /home)"]
        Viewer["StoryViewer modal"]
    end
    Create -- "POST /stories" --> Ctrl
    Bar -- "GET /stories/active" --> Ctrl
    Viewer -- "GET /stories/user/:authorId\nPOST /stories/:id/view" --> Ctrl

    subgraph Server
        Ctrl(StoriesController)
        Svc[StoriesService]
        Ctrl --> Svc
    end
    Svc --> DB[("Postgres: Story + StoryView")]
```

No WebSocket, no polling — every screen just fetches fresh on mount. A new story only becomes visible to others the next time they load `/home`.

## Data Model

```mermaid
erDiagram
    User ||--o{ Story : "authorId"
    User ||--o{ StoryView : "viewerId"
    Story ||--o{ StoryView : "storyId"

    Story {
        string id PK
        string authorId FK
        string url
        string type
        datetime createdAt
        datetime expiresAt
    }
    StoryView {
        string id PK
        string storyId FK
        string viewerId FK
        datetime viewedAt
    }
```

`expiresAt` is set once, at creation, to `createdAt + 24h`. There's no cleanup job — expired stories aren't deleted, they just permanently stop matching any `expiresAt > now` query.

## Creating a Story

```mermaid
sequenceDiagram
    participant You as Your browser
    participant Cloud as Cloudinary
    participant Ctrl as StoriesController
    participant Svc as StoriesService
    participant DB as Postgres

    You->>Cloud: upload file
    Cloud-->>You: { url, publicId }
    You->>Ctrl: POST /stories { url, publicId, type }
    Ctrl->>Svc: create(userId, dto)
    Svc->>DB: Story.create(expiresAt = now + 24h)
    DB-->>You: 201 Created
    Note over You: Redirected to /home - your ring<br/>now appears in the stories bar
```

## Loading the Stories Bar (Grouping + Seen/Unseen Ring)

```mermaid
sequenceDiagram
    participant You as Your browser (StoriesBar)
    participant Ctrl as StoriesController
    participant Svc as StoriesService
    participant DB as Postgres

    You->>Ctrl: GET /stories/active
    Ctrl->>Svc: getActiveStories(yourId)
    Svc->>DB: Story.findMany(expiresAt > now, include views where viewerId=you)
    DB-->>Svc: all non-expired stories, each with your view (if any)
    Svc->>Svc: group by authorId; allSeen = every story in that group already has your view
    Svc-->>You: [{ author, storyIds, allSeen }]
    Note over You: allSeen=false -> colored gradient ring<br/>allSeen=true -> plain gray ring
```

## Viewing a Story

```mermaid
sequenceDiagram
    participant You as Your browser (StoryViewer)
    participant Ctrl as StoriesController
    participant Svc as StoriesService
    participant DB as Postgres

    You->>Ctrl: GET /stories/user/:authorId
    Ctrl->>Svc: getStoriesByAuthor(authorId)
    Svc->>DB: Story.findMany(authorId, expiresAt > now)
    DB-->>You: that author's active stories, oldest first

    loop for each story shown
        You->>Ctrl: POST /stories/:id/view
        Ctrl->>Svc: markViewed(yourId, storyId)
        Svc->>DB: StoryView.upsert(storyId, viewerId)
        Note over You: 5s timer auto-advances to the next story,<br/>or closes the viewer after the last one
    end
```

# Notifications System Architecture

## Architecture Diagram

```mermaid
flowchart LR
    subgraph Producers["Notification producers (write on REST actions)"]
        FS[FollowService]
        PS[PostsService]
    end
    FS -- "follow request / accepted" --> DB[("Postgres: Notification table")]
    PS -- "like / comment" --> DB

    subgraph Browser
        Page["/notifications page"]
        Nav["BottomNav bell badge"]
    end
    Page -- "GET /notifications\nPOST /notifications/read-all" --> NC(NotificationsController)
    Nav -- "GET /notifications/unread-count\n(polled every 30s)" --> NC
    NC --> NS[NotificationsService]
    NS --> DB
```

**No WebSocket involved anywhere in this feature** — unlike chat, notifications are pure REST + a 30-second poll. The bell badge only updates when that poll fires or when you navigate to a page that refetches it.

## Data Model

```mermaid
erDiagram
    User ||--o{ Notification : "recipientId"
    User ||--o{ Notification : "actorId"
    Post ||--o{ Notification : "postId (optional)"

    Notification {
        string id PK
        string recipientId FK
        string actorId FK
        string type
        string postId FK
        boolean read
        datetime createdAt
    }
```

`type` is one of `FOLLOW_REQUEST`, `FOLLOW_ACCEPTED`, `LIKE`, `COMMENT`. `postId` is only set for `LIKE`/`COMMENT`.

## Follow Request → Notification

```mermaid
sequenceDiagram
    participant You as Your browser
    participant Ctrl as FollowController
    participant Svc as FollowService
    participant DB as Postgres

    You->>Ctrl: POST /users/mia/follow
    Ctrl->>Svc: sendRequest(yourId, "mia")
    Svc->>DB: Follow.create(status=PENDING)
    Svc->>DB: Notification.create(type=FOLLOW_REQUEST, recipient=mia, actor=you)
    DB-->>Svc: ok
    Note over You: No live push - Mia sees this<br/>on her next 30s poll or page visit
```

## Accepting a Request: One Notification Resolves Into Another

```mermaid
sequenceDiagram
    participant Mia as Mia's browser
    participant Ctrl as FollowController
    participant Svc as FollowService
    participant DB as Postgres

    Mia->>Ctrl: POST /users/you/follow/accept
    Ctrl->>Svc: acceptRequestFrom(miaId, "you")
    Svc->>DB: Follow.update(status=ACCEPTED)
    Svc->>DB: Notification.deleteMany(type=FOLLOW_REQUEST, recipient=mia, actor=you)
    Svc->>DB: Notification.create(type=FOLLOW_ACCEPTED, recipient=you, actor=mia)
    Note over Mia: Her FOLLOW_REQUEST notification is gone (resolved)
    Note over Mia: You get a new FOLLOW_ACCEPTED notification instead
```

Rejecting works the same way minus the final create step — the request notification is just deleted, silently.

## Like / Comment → Notification

```mermaid
sequenceDiagram
    participant You as Your browser
    participant Ctrl as PostsController
    participant Svc as PostsService
    participant DB as Postgres

    You->>Ctrl: POST /posts/:id/like (or /posts/:id/comments)
    Ctrl->>Svc: likePost / addComment
    Svc->>DB: Like.create / Comment.create
    Svc->>DB: Post.findUnique (look up authorId)
    alt authorId != you
        Svc->>DB: Notification.create(type=LIKE|COMMENT, recipient=author, actor=you, postId)
    else you acted on your own post
        Note over Svc: skipped - no self-notification
    end
```

## The Alert: Badge Polling + Reading the List

```mermaid
sequenceDiagram
    participant You as Your browser (BottomNav)
    participant Ctrl as NotificationsController
    participant Svc as NotificationsService
    participant DB as Postgres

    loop every 30s
        You->>Ctrl: GET /notifications/unread-count
        Ctrl->>Svc: unreadCount(yourId)
        Svc->>DB: count where recipient=you, read=false
        DB-->>You: { count }
        Note over You: Red badge on the bell icon updates
    end

    You->>Ctrl: opens /notifications -> GET /notifications
    Ctrl->>Svc: list(yourId)
    Svc->>DB: findMany (+ actor, post) and count
    DB-->>You: notifications, newest first

    You->>Ctrl: POST /notifications/read-all
    Ctrl->>Svc: markAllRead(yourId)
    Svc->>DB: updateMany(read=true)
    Note over You: Badge clears, blue "unread" row highlight removed
```

import { useEffect, useRef, useState } from "react";
import {
  maxPostImageBytes,
  maxPostImages,
  postImageMimes,
  postSchema,
  type Post,
  type PostImage,
} from "../shared/contracts.js";
import { api } from "./api.js";
import { Confirm, failure } from "./ui.js";

function imageSrc(post: Post, image: PostImage): string {
  return image.source === "bundled"
    ? image.path
    : `/api/posts/${encodeURIComponent(post.id)}/images/${image.id}`;
}

function postedLabel(at: string): string {
  return new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function PostCard({
  post,
  byline,
  onRemove,
}: {
  post: Post;
  byline: string;
  onRemove?: () => Promise<void>;
}) {
  return (
    <article className="card post post-update">
      <div className="post-body">
        <p className="post-meta">
          <b>{byline}</b> · {postedLabel(post.createdAt)}
        </p>
        {post.text && <p className="post-text">{post.text}</p>}
        {post.images.length > 0 && (
          <div className={`post-images post-images-${post.images.length}`}>
            {post.images.map((image) => {
              const src = imageSrc(post, image);
              return (
                <a key={src} href={src} target="_blank" rel="noreferrer">
                  <img
                    className={image.source === "bundled" ? "post-image-art" : undefined}
                    src={src}
                    alt=""
                    loading="lazy"
                  />
                </a>
              );
            })}
          </div>
        )}
      </div>
      {onRemove && (
        <div className="post-actions">
          <Confirm
            label="Delete"
            question="Delete this post?"
            confirmLabel="Delete post"
            onConfirm={onRemove}
          >
            Students stop seeing it.
          </Confirm>
        </div>
      )}
    </article>
  );
}

const maxSide = 1600;

async function shrink(file: File): Promise<Blob> {
  if (!(postImageMimes as readonly string[]).includes(file.type))
    throw new Error(`${file.name} isn't a PNG, JPEG, WebP or GIF picture.`);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (file.size <= maxPostImageBytes && scale === 1) return file;
  if (file.type === "image/gif")
    throw new Error(`${file.name} is too big. Animated GIFs must be under 1 MB.`);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't resize pictures.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= maxPostImageBytes) return blob;
  }
  throw new Error(`${file.name} is too big even after shrinking it.`);
}

type Picked = { key: string; blob: Blob; preview: string };

export function PostComposer({
  courseId,
  onPosted,
}: {
  courseId: string;
  onPosted: () => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [pictures, setPictures] = useState<Picked[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    input = useRef<HTMLInputElement>(null);
  const previews = useRef(new Set<string>());
  useEffect(
    () => () => previews.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );
  function preview(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    previews.current.add(url);
    return url;
  }
  function drop(picked: Picked) {
    URL.revokeObjectURL(picked.preview);
    previews.current.delete(picked.preview);
    setPictures((current) => current.filter((p) => p !== picked));
  }
  async function pick(files: FileList | null) {
    setError("");
    const chosen = [...(files ?? [])];
    if (pictures.length + chosen.length > maxPostImages) {
      setError(`A post can have up to ${maxPostImages} pictures.`);
      return;
    }
    try {
      const blobs = await Promise.all(chosen.map(shrink));
      const added = blobs.map((blob, index) => ({
        key: `${chosen[index]?.name}-${crypto.randomUUID()}`,
        blob,
        preview: preview(blob),
      }));
      setPictures((current) => [...current, ...added].slice(0, maxPostImages));
    } catch (e) {
      setError(failure(e, "Could not add that picture."));
    }
  }
  async function publish() {
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("text", text);
    for (const p of pictures) form.append("images", p.blob, p.key);
    try {
      await api(`/teacher/courses/${courseId}/posts`, postSchema, {
        method: "POST",
        body: form,
      });
      setText("");
      pictures.forEach(drop);
      await onPosted();
    } catch (e) {
      setError(failure(e, "Could not post that."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="card composer"
      onSubmit={(event) => {
        event.preventDefault();
        void publish();
      }}
    >
      <label htmlFor="post-text" className="visually-hidden">
        Announce something to your class
      </label>
      <textarea
        id="post-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Announce something to your class"
        maxLength={5000}
        rows={3}
      />
      {pictures.length > 0 && (
        <div className="composer-pictures">
          {pictures.map((p) => (
            <span key={p.key} className="composer-picture">
              <img src={p.preview} alt="" />
              <button
                type="button"
                className="composer-remove"
                aria-label="Remove picture"
                onClick={() => drop(p)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-row">
        <input
          ref={input}
          type="file"
          accept={postImageMimes.join(",")}
          multiple
          hidden
          onChange={(event) => {
            void pick(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="choice"
          disabled={busy || pictures.length >= maxPostImages}
          onClick={() => input.current?.click()}
        >
          Add pictures
        </button>
        <button
          className="choice choice-primary"
          disabled={busy || (!text.trim() && pictures.length === 0)}
        >
          {busy ? "Posting" : "Post"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

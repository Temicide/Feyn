import { useEffect, useState } from "react";

export type Route =
  | { kind: "courses" }
  | { kind: "course"; courseId: string }
  | { kind: "assignment"; assignmentId: string }
  | { kind: "desk" }
  | { kind: "teach-course"; courseId: string }
  | { kind: "evidence"; assignmentId: string; attemptId: string | null }
  | { kind: "edit"; assignmentId: string };

export function parseRoute(hash: string): Route {
  const [first, second, third, fourth] = hash
    .replace(/^#\/?/, "")
    .split("/")
    .map(decodeURIComponent);
  if (first === "course" && second) return { kind: "course", courseId: second };
  if (first === "assignment" && second)
    return { kind: "assignment", assignmentId: second };
  if (first === "teach") {
    if (second === "course" && third)
      return { kind: "teach-course", courseId: third };
    if (second === "assignment" && third)
      return fourth === "edit"
        ? { kind: "edit", assignmentId: third }
        : { kind: "evidence", assignmentId: third, attemptId: fourth || null };
    return { kind: "desk" };
  }
  return { kind: "courses" };
}

export function href(route: Route): string {
  const path = (...parts: string[]) =>
    `#/${parts.map(encodeURIComponent).join("/")}`;
  switch (route.kind) {
    case "courses":
      return "#/";
    case "course":
      return path("course", route.courseId);
    case "assignment":
      return path("assignment", route.assignmentId);
    case "desk":
      return path("teach");
    case "teach-course":
      return path("teach", "course", route.courseId);
    case "evidence":
      return route.attemptId
        ? path("teach", "assignment", route.assignmentId, route.attemptId)
        : path("teach", "assignment", route.assignmentId);
    case "edit":
      return path("teach", "assignment", route.assignmentId, "edit");
  }
}

export function go(route: Route): void {
  location.hash = href(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const update = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}

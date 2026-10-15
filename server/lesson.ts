import type { Lesson } from "../shared/contracts.js";
export const lesson = {
  id: "cart-speed",
  title: "A moment in motion",
  subject: "CALCULUS · RATES OF CHANGE",
  question:
    "A cart's distance from its start is s(t) = t² meters, where t is time in seconds. Explain to Pip what its speed at exactly three seconds means and how to find it.",
  reference:
    "Average speed over an interval is change in distance divided by elapsed time. Instantaneous speed is the limit of that average as the interval shrinks. Here v(t) = 2t meters per second, so v(3) = 6 meters per second.",
  concepts: [
    {
      id: "distance-speed",
      title: "Distance and speed",
      description:
        "Distance describes position relative to the start; speed describes how quickly that distance changes.",
    },
    {
      id: "average-instantaneous",
      title: "An interval or a moment",
      description:
        "Average speed concerns an interval; instantaneous speed concerns a particular moment.",
    },
    {
      id: "six-at-three",
      title: "What 6 m/s means",
      description:
        "At three seconds the instantaneous rate of change is six meters per second, rather than a distance or a whole-second average.",
    },
  ],
  followups: [
    {
      id: "followup-1",
      conceptIds: ["average-instantaneous", "six-at-three"],
      question:
        "The cart travels seven meters between three and four seconds. Does that mean its speed at exactly three seconds is seven meters per second? Explain.",
      expected:
        "Seven meters per second is the average over that whole second. Speed changes during the interval. Speed at exactly three seconds is six meters per second.",
    },
    {
      id: "followup-2",
      conceptIds: ["six-at-three"],
      question:
        "What is the speed at five seconds, and why does it differ from the speed at three seconds?",
      expected:
        "Ten meters per second. The rate of change of t² is 2t, so speed increases with time.",
    },
  ],
} satisfies Lesson;

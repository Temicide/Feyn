# Let U-Bot draft assignments and the teacher post them

Teachers create assignments for their own courses. The teacher enters a question and a reference answer, U-Bot proposes the essential concepts and follow-up questions, and the teacher edits the draft before posting it. Only a posted assignment reaches students or the assessor.

Assignments therefore become stored records rather than code. Concept IDs stop being a fixed enum in the shared types, and the main assessment expects exactly one criterion per concept of the assignment being assessed, between one and five.

Two cheaper options were considered. A built-in assignment library would have kept every rubric pre-tested, and a manual form would have avoided another call to U-Bot's unpublished chat API. The user chose U-Bot drafting because it shows a teacher creating a complete course quickly. The draft is a proposal like the bot assessment: the teacher keeps final judgment over the rubric. When U-Bot is unavailable or its reply fails validation, the same form remains editable by hand, so a provider failure never blocks a teacher from posting an assignment.

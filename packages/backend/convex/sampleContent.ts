export const sampleRubrics = {
  questionVersion: "sample-label-membership-v1",
  rubricVersion: "sample-library-v1",
  labels: [
    {
      name: "Research",
      guideline:
        "Useful source material to revisit when learning or investigating a topic.",
    },
    {
      name: "Ideas",
      guideline:
        "An observation, proposal, or visual inspiration that could lead to something new.",
    },
  ],
};

export const examples = [
  {
    inputType: "url" as const,
    originalInput: "https://example.org/research",
    title: "Example research link",
  },
  {
    inputType: "text" as const,
    originalInput:
      "Idea: use labels as overlapping collections. One saved item can belong to Research and Ideas.",
    title: "An idea with two labels",
  },
  {
    inputType: "url" as const,
    originalInput: "https://example.org/visual-notes",
    title: "Example with a screenshot reference",
  },
];

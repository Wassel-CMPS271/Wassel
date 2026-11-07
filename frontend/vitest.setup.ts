// Adds the jest-dom matchers (toBeInTheDocument, etc.) to every test file.
import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// findBy* and waitFor give up after 1 second by default. On a busy machine or CI runner, focus moves and
// dnd-kit's hidden instructions can take longer than that, which made route-page tests fail now and then
// (SCRUM-257's merge on develop). Passing tests are not slower: they stop waiting as soon as they pass.
configure({ asyncUtilTimeout: 4000 });

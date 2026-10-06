import { vi } from "vitest";
import { getFunctionName } from "convex/server";

/** Mutable backend/auth state behind the shared Clerk and Convex mocks. */
export const backend = {
  seedEnabled: false,
  label: undefined as unknown,
  labels: [] as { _id: string; name: string }[],
  labelsStatus: "Exhausted" as string,
  load: vi.fn(),
  signOut: vi.fn(),
  createLabel: vi.fn(),
  loadMore: vi.fn(),
};

export function resetBackend() {
  backend.seedEnabled = false;
  backend.label = undefined;
  backend.labels = [];
  backend.labelsStatus = "Exhausted";
  for (const fn of [
    backend.load,
    backend.signOut,
    backend.createLabel,
    backend.loadMore,
  ])
    fn.mockReset();
}

export const clerkMock = {
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "alice",
    sessionId: "session-a",
  }),
  useUser: () => ({
    user: { firstName: "Martin", fullName: "Martin Ruzek" },
  }),
  useClerk: () => ({ openUserProfile: () => {}, signOut: backend.signOut }),
  SignInButton: () => null,
  SignUpButton: () => null,
};

export const convexMock = {
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === "seed:availability") return { enabled: backend.seedEnabled };
    if (name === "labels:get") return backend.label;
    throw new Error(`Unmocked query ${name}`);
  },
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === "seed:load") return backend.load;
    if (name === "labels:create") return backend.createLabel;
    throw new Error(`Unmocked mutation ${name}`);
  },
  usePaginatedQuery: () => ({
    results: backend.labels,
    status: backend.labelsStatus,
    loadMore: backend.loadMore,
  }),
};

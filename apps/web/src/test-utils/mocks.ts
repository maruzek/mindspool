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
  updateLabel: vi.fn(),
  createItem: vi.fn(),
  loadMore: vi.fn(),
  items: [] as unknown[],
  itemsStatus: "Exhausted" as string,
  labelItems: [] as unknown[],
  labelItemsStatus: "Exhausted" as string,
  loadMoreItems: vi.fn(),
  /** Thrown by the items queries, like a failed Convex subscription. */
  itemsError: null as Error | null,
  /** `items.detail` result for an id; `undefined` means still loading. */
  itemLabels: [] as unknown[],
  itemLabelsStatus: "Exhausted" as string,
  loadMoreItemLabels: vi.fn(),
  removeItemLabel: vi.fn(),
  confirmItemLabel: vi.fn(),
  classify: vi.fn(),
  removeItem: vi.fn(),
  runs: [] as unknown[],
  runsStatus: "Exhausted" as string,
  attachItemLabel: vi.fn(),
  available: [] as unknown[],
  availableStatus: "Exhausted" as string,
  loadMoreAvailable: vi.fn(),
  detail: (_args: unknown): unknown => null,
  /** Arguments of the most recent paginated query per function name. */
  paginatedArgs: {} as Record<string, unknown>,
};

export function resetBackend() {
  backend.seedEnabled = false;
  backend.label = undefined;
  backend.labels = [];
  backend.labelsStatus = "Exhausted";
  backend.items = [];
  backend.itemsStatus = "Exhausted";
  backend.labelItems = [];
  backend.labelItemsStatus = "Exhausted";
  backend.paginatedArgs = {};
  backend.itemsError = null;
  backend.detail = () => null;
  backend.itemLabels = [];
  backend.itemLabelsStatus = "Exhausted";
  backend.runs = [];
  backend.runsStatus = "Exhausted";
  backend.available = [];
  backend.availableStatus = "Exhausted";
  for (const fn of [
    backend.load,
    backend.signOut,
    backend.createLabel,
    backend.updateLabel,
    backend.createItem,
    backend.loadMore,
    backend.loadMoreItems,
    backend.loadMoreItemLabels,
    backend.removeItemLabel,
    backend.confirmItemLabel,
    backend.classify,
    backend.removeItem,
    backend.attachItemLabel,
    backend.loadMoreAvailable,
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
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args?: unknown) => {
    const name = getFunctionName(ref);
    if (args === "skip") return undefined;
    if (name === "items:detail") return backend.detail(args);
    if (name === "seed:availability") return { enabled: backend.seedEnabled };
    if (name === "labels:get") return backend.label;
    throw new Error(`Unmocked query ${name}`);
  },
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === "seed:load") return backend.load;
    if (name === "labels:create") return backend.createLabel;
    if (name === "labels:update") return backend.updateLabel;
    if (name === "items:create") return backend.createItem;
    if (name === "itemLabels:remove") return backend.removeItemLabel;
    if (name === "itemLabels:confirm") return backend.confirmItemLabel;
    if (name === "decisions:classify") return backend.classify;
    if (name === "items:remove") return backend.removeItem;
    if (name === "itemLabels:attach") return backend.attachItemLabel;
    throw new Error(`Unmocked mutation ${name}`);
  },
  usePaginatedQuery: (
    ref: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) => {
    const name = getFunctionName(ref);
    backend.paginatedArgs[name] = args;
    if (name.startsWith("items:") && backend.itemsError)
      throw backend.itemsError;
    if (name === "items:list")
      return {
        results: backend.items,
        status: backend.itemsStatus,
        loadMore: backend.loadMoreItems,
      };
    if (name === "processingRuns:listForItem")
      return {
        results: backend.runs,
        status: backend.runsStatus,
        loadMore: vi.fn(),
      };
    if (name === "itemLabels:availableLabels")
      return {
        results: backend.available,
        status: backend.availableStatus,
        loadMore: backend.loadMoreAvailable,
      };
    if (name === "itemLabels:listForItem")
      return {
        results: backend.itemLabels,
        status: backend.itemLabelsStatus,
        loadMore: backend.loadMoreItemLabels,
      };
    if (name === "itemLabels:listItemsForLabel")
      return {
        results: backend.labelItems,
        status: backend.labelItemsStatus,
        loadMore: backend.loadMoreItems,
      };
    return {
      results: backend.labels,
      status: backend.labelsStatus,
      loadMore: backend.loadMore,
    };
  },
};

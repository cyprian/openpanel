import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from '@/routes/_app.$organizationId.$projectId.ml';

const mocks = vi.hoisted(() => ({
  archiveProject: vi.fn(),
  confirm: vi.fn(),
  projects: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useParams: () => ({ organizationId: 'org', projectId: 'analytics-project' }),
  }),
  useMatchRoute: () => () => true,
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  Outlet: () => null,
}));
vi.mock('@/hooks/use-page-context-helpers', () => ({ useMlPageContext: vi.fn() }));
vi.mock('@/components/ml/project-actions', () => ({ MlProjectActions: () => null }));
vi.mock('@/components/page-container', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/page-header', () => ({
  PageHeader: ({ actions }: { actions: React.ReactNode }) => <header>{actions}</header>,
}));
vi.mock('@/modals', () => ({ showConfirm: mocks.confirm }));
vi.mock('sonner', () => ({ toast: { success: mocks.success } }));
vi.mock('@/integrations/trpc/react', () => ({
  handleErrorToastOptions: () => mocks.error,
  useTRPC: () => ({
    ml: {
      pathFilter: () => ({ queryKey: ['ml'] }),
      projects: {
        queryOptions: () => ({ queryKey: ['ml', 'projects'], queryFn: mocks.projects }),
        pathFilter: () => ({ queryKey: ['ml', 'projects'] }),
      },
      createProject: { mutationOptions: (options: object) => ({ ...options, mutationFn: vi.fn() }) },
      archiveProject: { mutationOptions: (options: object) => ({ ...options, mutationFn: mocks.archiveProject }) },
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projects.mockResolvedValue([
    { id: 'a', name: 'Alpha', _count: { runs: 2 }, storageBytes: 0, updatedAt: new Date() },
    { id: 'b', name: 'Beta', _count: { runs: 3 }, storageBytes: 0, updatedAt: new Date() },
  ]);
  mocks.archiveProject.mockResolvedValue({});
});
afterEach(cleanup);

async function renderProjects() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  // The router is mocked so the index can be exercised without navigation or a server.
  const Component = (Route as unknown as { component: () => React.ReactNode }).component;
  render(<QueryClientProvider client={client}><Component /></QueryClientProvider>);
  await screen.findByRole('checkbox', { name: 'Select Alpha' });
  return client;
}

describe('ML project selection', () => {
  it('supports individual, mixed, and select-all states without deleting', async () => {
    await renderProjects();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
    expect(screen.getByRole('button', { name: 'Delete 1' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Select all projects' }).getAttribute('aria-checked')).toBe('mixed');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all projects' }));
    expect(screen.getByRole('button', { name: 'Delete 2' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all projects' }));
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
    expect(mocks.archiveProject).not.toHaveBeenCalled();
  });

  it('requires confirmation and deletes only checked projects in the current analytics project', async () => {
    await renderProjects();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete 1' }));
    expect(mocks.archiveProject).not.toHaveBeenCalled();
    const confirmation = mocks.confirm.mock.calls[0]?.[0];
    expect(confirmation.text).toContain('3 runs');
    confirmation.onConfirm();
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Deleted 1 ML project'));
    expect(mocks.archiveProject.mock.calls.map(([input]) => input)).toEqual([{ id: 'b', projectId: 'analytics-project' }]);
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  });

  it('retains failed selections and refreshes the list after a partial failure', async () => {
    const client = await renderProjects();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    mocks.archiveProject.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Deletion failed'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all projects' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }));
    mocks.confirm.mock.calls[0]?.[0].onConfirm();
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['ml'] });
    expect(screen.getByRole('checkbox', { name: 'Select Alpha' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('checkbox', { name: 'Select Beta' }).getAttribute('aria-checked')).toBe('true');
    expect(mocks.success).not.toHaveBeenCalled();
  });
});

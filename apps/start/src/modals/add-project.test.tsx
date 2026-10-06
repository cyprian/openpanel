import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AddProject from './add-project';

type CreatedProject = {
  id: string;
  name: string;
  types: string[];
  client: { id: string; secret: string };
};

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  popModal: vi.fn(),
  invalidateQueries: vi.fn(),
  mutation: {
    isSuccess: false,
    isPending: false,
    data: undefined as CreatedProject | undefined,
    mutate: vi.fn(),
  },
  onSuccess: undefined as ((project: CreatedProject) => void) | undefined,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useMutation: (options: { onSuccess: (project: CreatedProject) => void }) => {
    mocks.onSuccess = options.onSuccess;
    return mocks.mutation;
  },
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/hooks/use-app-params', () => ({ useAppParams: () => ({ organizationId: 'org-1' }) }));
vi.mock('@/integrations/trpc/react', () => ({
  handleError: vi.fn(),
  useTRPC: () => ({
    project: {
      create: { mutationOptions: (options: unknown) => options },
      list: { queryFilter: () => ({ queryKey: ['projects'] }) },
    },
  }),
}));
vi.mock('.', () => ({ popModal: mocks.popModal }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('./Modal/Container', () => ({
  ModalContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/components/clients/create-client-success', () => ({
  CreateClientSuccess: ({ secret }: { secret: string }) => <div>Credentials: {secret}</div>,
}));
vi.mock('@/components/animate-height', () => ({
  default: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
}));

const project: CreatedProject = {
  id: 'project-1',
  name: 'My project',
  types: ['website'],
  client: { id: 'client-1', secret: 'new-client-secret' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutation.isSuccess = false;
  mocks.mutation.data = undefined;
  sessionStorage.clear();
});
afterEach(cleanup);

describe('project creation after upstream sync', () => {
  it('keeps the ML tracking option alongside analytics options', () => {
    render(<AddProject />);
    expect(screen.getByRole('button', { name: /ML Track machine learning/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Website Track events/ })).toBeTruthy();
  });

  it('keeps direct navigation to the custom ML dashboard after creating an ML project', () => {
    render(<AddProject />);
    act(() => mocks.onSuccess?.({ ...project, types: ['ml'] }));
    expect(mocks.popModal).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/$organizationId/$projectId/ml',
      params: { organizationId: 'org-1', projectId: 'project-1' },
    });
  });

  it('shows analytics credentials and passes the secret to upstream tracking setup', () => {
    const view = render(<AddProject />);
    act(() => mocks.onSuccess?.(project));
    expect(mocks.popModal).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    mocks.mutation.isSuccess = true;
    mocks.mutation.data = project;
    view.rerender(<AddProject />);
    expect(screen.getByText('Credentials: new-client-secret')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Set up tracking' });
    expect(link.getAttribute('href')).toBe('/onboarding/project-1/connect');
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);
    expect(sessionStorage.getItem('onboarding.clientSecret')).toBe('new-client-secret');
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SidebarProjectMenu from './sidebar-project-menu';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('./sidebar-link', () => ({
  SidebarLink: ({ href, label }: { href: string; label: string }) => <a href={href}>{label}</a>,
}));
vi.mock('@/components/chat/sidebar-chat-composer', () => ({ SidebarChatComposer: () => null }));
vi.mock('@/components/chat/chat-context', () => ({ useChatState: () => ({ openChatForContext: vi.fn() }) }));
vi.mock('@/modals', () => ({ pushModal: vi.fn() }));

afterEach(cleanup);

describe('project integration navigation after upstream sync', () => {
  it('keeps Slack setup reachable from an ML project after integrations move to project scope', () => {
    render(<SidebarProjectMenu dashboards={[]} isMlProject />);
    expect(screen.getByRole('link', { name: 'Integrations' }).getAttribute('href')).toBe('/integrations');
    expect(screen.getByRole('link', { name: 'ML Projects' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull();
  });

  it('exposes integrations in the analytics project menu too', () => {
    render(<SidebarProjectMenu dashboards={[]} />);
    expect(screen.getByRole('link', { name: 'Integrations' }).getAttribute('href')).toBe('/integrations');
    expect(screen.getByRole('link', { name: 'Overview' })).toBeTruthy();
  });
});

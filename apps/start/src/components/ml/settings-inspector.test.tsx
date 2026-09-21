import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsInspector } from './settings-inspector';

afterEach(cleanup);

const settings = {
  optimizer: { learning_rate: 0.000_015, enabled: true },
  model: { encoder_type: 'dinov2', layers: [1, 2, 4] },
  stages: [{ name: 'warmup', resume: null }, { name: 'training', resume: false }],
  empty_text: '',
  empty_list: [],
};

describe('SettingsInspector', () => {
  it('renders nested objects, object arrays, and distinct empty values', () => {
    render(<SettingsInspector value={settings} />);
    expect(screen.getByText('Learning rate')).toBeTruthy();
    expect(screen.getByText('0.000015')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
    expect(screen.getByText('Item 1')).toBeTruthy();
    expect(screen.getByText('Not set (null)')).toBeTruthy();
    expect(screen.getByText('Empty string')).toBeTruthy();
    expect(screen.getByText('Empty list', { selector: 'span' })).toBeTruthy();
  });

  it('reveals search results in collapsed parents and restores collapse state when cleared', () => {
    render(<SettingsInspector value={settings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByText('dinov2')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'DINO' } });
    expect(screen.getByText('Model')).toBeTruthy();
    expect(screen.getByText('dinov2')).toBeTruthy();
    expect(screen.queryByText('Optimizer')).toBeNull();
    expect(screen.queryByText('Layers')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.queryByText('dinov2')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByText('dinov2')).toBeTruthy();
  });

  it('searches original keys, readable labels, and object-array values', () => {
    render(<SettingsInspector value={settings} />);
    for (const query of ['learning_rate', 'learning rate']) {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
      expect(screen.getByText('0.000015')).toBeTruthy();
    }
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'warmup' } });
    expect(screen.getByText('Stages')).toBeTruthy();
    expect(screen.getByText('Item 1')).toBeTruthy();
    expect(screen.queryByText('Item 2')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no-such-setting' } });
    expect(screen.getByRole('status').textContent).toBe('No matching settings.');
  });

  it('copies original values and the complete JSON even while searching', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<SettingsInspector value={settings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy enabled' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('true'));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'warmup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify(settings, null, 2)));
  });
});

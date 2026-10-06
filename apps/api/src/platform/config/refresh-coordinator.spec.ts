import { RefreshCoordinator } from '../../../../../src/lib/server/refresh-coordinator';

describe('refresh coordination', () => {
  it('shares concurrent rotation and lets overlapping requests reuse its result', async () => {
    const coordinator = new RefreshCoordinator<string>();
    const rotate = jest.fn(() => Promise.resolve('replacement'));
    await expect(
      Promise.all([
        coordinator.run('same-session', rotate),
        coordinator.run('same-session', rotate),
      ]),
    ).resolves.toEqual(['replacement', 'replacement']);
    await expect(coordinator.run('same-session', rotate)).resolves.toBe(
      'replacement',
    );
    expect(rotate).toHaveBeenCalledTimes(1);
  });
  it('separates sessions and expires the overlap window', async () => {
    let now = 0;
    const coordinator = new RefreshCoordinator<string>(10, () => now);
    const rotate = jest.fn(() => Promise.resolve('replacement'));
    await coordinator.run('first', rotate);
    await coordinator.run('second', rotate);
    now = 11;
    await coordinator.run('first', rotate);
    expect(rotate).toHaveBeenCalledTimes(3);
  });
  it('allows retry after a failed network request', async () => {
    const coordinator = new RefreshCoordinator<string>();
    await expect(
      coordinator.run('session', () =>
        Promise.reject(new Error('network failure')),
      ),
    ).rejects.toThrow('network failure');
    await expect(
      coordinator.run('session', () => Promise.resolve('replacement')),
    ).resolves.toBe('replacement');
  });
});

export const getNavigatorGpu = (navigatorLike?: unknown): GPU | null => {
  const nav = (navigatorLike ?? (typeof navigator === 'undefined' ? null : navigator)) as unknown as { gpu?: GPU } | null;
  if (!nav) return null;
  const maybe = nav.gpu;
  return maybe ?? null;
};

export const isWebgpuSupported = (navigatorLike?: unknown): boolean => {
  return !!getNavigatorGpu(navigatorLike);
};

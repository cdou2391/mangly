// Native-module mocks for the smoke tests. Deliberately imports no app code, so jest.mock factories
// can require it without creating an import cycle.
export const store: Record<string, string> = {};

export const secureStoreMock = () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    store[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    delete store[k];
  }),
});

export const splashMock = () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => {}),
});

export const pushMock = () => ({
  registerForPush: jest.fn(async () => {}),
  unregisterPush: jest.fn(async () => {}),
});

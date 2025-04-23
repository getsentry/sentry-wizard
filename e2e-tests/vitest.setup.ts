if (process.env.CI) {
  try {
    const path = require.resolve('uuid');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
    const original = require(path);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof original.v4 !== 'function') {
      throw new Error('uuid.v4 missing');
    }
  } catch (e) {
    require.cache[require.resolve('uuid')] = {
      id: 'uuid',
      filename: 'uuid',
      loaded: true,
      exports: {
        v4: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        }),
      },
      children: [],
      paths: [],
      isPreloading: false,
      parent: null,
      path: '',
      require: require,
    };
  }
}
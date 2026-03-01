jest.mock('mongodb-memory-server', () => ({
  MongoMemoryServer: {
    create: jest.fn().mockResolvedValue({
      getUri: jest.fn().mockReturnValue('mongodb://localhost:27017/dummy'),
      stop: jest.fn().mockResolvedValue(true),
    }),
  },
}));
const { pickAllowedBoardFields } = require('../../domain/stickerboards/pickAllowedBoardFields');

const allowedFields = ['name', 'description', 'tags', 'photo', 'stickers'];

const body = {
  name: 'rename this board!!!',
  description: 'big baby board',
  tags: ['good','bad','indifferent'],
  photo: 'photo',
  stickers: []
};
const badBody = {
  name: "rename this board!!!",
  description: 'big baby board',
  lol: 'wut',
  hax: 'hax',
  tags: ['good','bad','indifferent'],
  photo: 'photo',
  stickers: []
}

describe('nonOwnerAppendPolicy', () => {
  test('Update allowed fields on a stickerboard', () => {
    expect(pickAllowedBoardFields(body, allowedFields)).toEqual(body)
  });
  test('Update NOT allowed fields on a stickerboard', () => {
    expect(pickAllowedBoardFields(badBody, allowedFields)).toEqual(body)
  });
});


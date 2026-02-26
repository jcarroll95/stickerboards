// This is a schema for a single stickerboard
const mongoose = require('mongoose');
const slugify = require('slugify');

const StickerboardSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please name your stickerboard'],
        unique: false,
        trim: true,
        maxlength: [50, 'Name can not exceed 50 characters'],
    },
    slug: String,
    description: {
        type: String,
        required: [true, 'Please describe your stickerboard'],
        maxlength: [500, 'Description can not exceed 500 characters'],
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    tags: [String],
    photo: {
        type: String,
        default: 'no-photo.jpg'
    },
    thumbnail: {
        version: Number,          // epoch ms
        width: Number,
        height: Number,
        contentType: String,      // image/webp
        bytes: Number,
        url: String,               // full CDN URL
        createdAt: { type: Date, default: Date.now }
    },
    totalCost: Number,
    averageRating: Number,
    averageCost: Number,
    backgroundFile: String,      // references a predefined asset
    width: Number,             // logical width (e.g. 1000)
    height: Number,            // logical height (e.g. 700)
    stickers: [
        {
            stickerId: { type: mongoose.Schema.Types.Mixed, required: true },     // supports both Number (legacy) and ObjectId (new)
            imageUrl: String,                                                     // Persisted URL for inventory stickers
            name: String,                                                         // Persisted name
            x: { type: Number, required: true, min: -5000, max: 5000 },             // normalized or absolute coordinates
            y: { type: Number, required: true, min: -5000, max: 5000 },
            scale: { type: Number, default: 1, min: 0.0001, max: 10 },
            rotation: { type: Number, default: 0, min: -360, max: 360 },
            zIndex: { type: Number, default: 0, min: 0, max: 100000 },
            stuck: { type: Boolean, default: false },
            isCheers: {
                type: Boolean,
                default: false
            },
            createdAt: { type: Date, default: Date.now }
        }
    ]
},
    {
        toJSON: { virtuals: true }
    },
);

// stickerboard names no longer unique, let's add an index
StickerboardSchema.index({ user: 1, name: 1 }, { unique: true });

// create a stickerboard slug from the name.
StickerboardSchema.pre('save', function () {
    this.slug = slugify(this.name, { lower: true });
});

// Cascade delete stix and comments when a stickerboard is deleted
StickerboardSchema.pre('deleteOne', { document: true, query: false },async function (next) {
    await this.model('Stick').deleteMany( { belongsToBoard: this._id });
    await this.model('Comment').deleteMany( { belongsToBoard: this._id });
});

// Reverse population with virtual fields
StickerboardSchema.virtual('stix', {
    ref: 'Stick',
    localField: '_id',
    foreignField: 'belongsToBoard',
    justOne: false
});

StickerboardSchema.virtual('comments', {
    ref: 'Comment',
    localField: '_id',
    foreignField: 'belongsToBoard',
    justOne: false
});

StickerboardSchema.statics.findByIdOrSlug = function(idOrSlug) {
  const query = mongoose.Types.ObjectId.isValid(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: idOrSlug };

  return this.findOne(query);
};

module.exports = mongoose.models.Stickerboard || mongoose.model('Stickerboard', StickerboardSchema);

/** Original raster pixel casts. Rectangles are measured from visible alpha bounds,
 * with a four-pixel safety gutter; rows are expression variants, not animation timing. */
export type PixelExpression = 'neutral' | 'speaking' | 'questioning' | 'confident' | 'shocked';
export type PixelRole = 'plaintiff' | 'judge' | 'defendant';
export interface PixelFrame { x: number; y: number; width: number; height: number }
export interface PixelAtlas {
  width: number;
  height: number;
  frames: Record<PixelExpression, Record<PixelRole, PixelFrame>>;
}

export const PIXEL_ATLASES = {
  "everyday": {
    "width": 971,
    "height": 1619,
    "frames": {
      "neutral": {
        "plaintiff": {
          "x": 13,
          "y": 26,
          "width": 259,
          "height": 290
        },
        "judge": {
          "x": 327,
          "y": 26,
          "width": 307,
          "height": 290
        },
        "defendant": {
          "x": 674,
          "y": 26,
          "width": 268,
          "height": 290
        }
      },
      "speaking": {
        "plaintiff": {
          "x": 8,
          "y": 353,
          "width": 311,
          "height": 288
        },
        "judge": {
          "x": 328,
          "y": 353,
          "width": 307,
          "height": 288
        },
        "defendant": {
          "x": 663,
          "y": 353,
          "width": 304,
          "height": 288
        }
      },
      "questioning": {
        "plaintiff": {
          "x": 8,
          "y": 678,
          "width": 269,
          "height": 280
        },
        "judge": {
          "x": 330,
          "y": 678,
          "width": 300,
          "height": 280
        },
        "defendant": {
          "x": 668,
          "y": 678,
          "width": 290,
          "height": 280
        }
      },
      "confident": {
        "plaintiff": {
          "x": 8,
          "y": 995,
          "width": 292,
          "height": 288
        },
        "judge": {
          "x": 331,
          "y": 995,
          "width": 297,
          "height": 288
        },
        "defendant": {
          "x": 676,
          "y": 995,
          "width": 282,
          "height": 288
        }
      },
      "shocked": {
        "plaintiff": {
          "x": 6,
          "y": 1326,
          "width": 269,
          "height": 279
        },
        "judge": {
          "x": 319,
          "y": 1326,
          "width": 311,
          "height": 279
        },
        "defendant": {
          "x": 656,
          "y": 1326,
          "width": 292,
          "height": 279
        }
      }
    }
  },
  "city": {
    "width": 971,
    "height": 1619,
    "frames": {
      "neutral": {
        "plaintiff": {
          "x": 29,
          "y": 33,
          "width": 259,
          "height": 286
        },
        "judge": {
          "x": 342,
          "y": 33,
          "width": 276,
          "height": 286
        },
        "defendant": {
          "x": 682,
          "y": 33,
          "width": 255,
          "height": 286
        }
      },
      "speaking": {
        "plaintiff": {
          "x": 9,
          "y": 349,
          "width": 303,
          "height": 290
        },
        "judge": {
          "x": 329,
          "y": 349,
          "width": 323,
          "height": 290
        },
        "defendant": {
          "x": 656,
          "y": 349,
          "width": 308,
          "height": 290
        }
      },
      "questioning": {
        "plaintiff": {
          "x": 19,
          "y": 672,
          "width": 260,
          "height": 291
        },
        "judge": {
          "x": 336,
          "y": 672,
          "width": 283,
          "height": 291
        },
        "defendant": {
          "x": 677,
          "y": 672,
          "width": 259,
          "height": 291
        }
      },
      "confident": {
        "plaintiff": {
          "x": 10,
          "y": 992,
          "width": 296,
          "height": 292
        },
        "judge": {
          "x": 354,
          "y": 992,
          "width": 265,
          "height": 292
        },
        "defendant": {
          "x": 672,
          "y": 992,
          "width": 262,
          "height": 292
        }
      },
      "shocked": {
        "plaintiff": {
          "x": 23,
          "y": 1318,
          "width": 260,
          "height": 292
        },
        "judge": {
          "x": 328,
          "y": 1318,
          "width": 294,
          "height": 292
        },
        "defendant": {
          "x": 665,
          "y": 1318,
          "width": 278,
          "height": 292
        }
      }
    }
  },
  "night": {
    "width": 971,
    "height": 1619,
    "frames": {
      "neutral": {
        "plaintiff": {
          "x": 27,
          "y": 31,
          "width": 266,
          "height": 286
        },
        "judge": {
          "x": 326,
          "y": 31,
          "width": 290,
          "height": 286
        },
        "defendant": {
          "x": 665,
          "y": 31,
          "width": 285,
          "height": 286
        }
      },
      "speaking": {
        "plaintiff": {
          "x": 18,
          "y": 345,
          "width": 299,
          "height": 297
        },
        "judge": {
          "x": 325,
          "y": 345,
          "width": 292,
          "height": 297
        },
        "defendant": {
          "x": 653,
          "y": 345,
          "width": 305,
          "height": 297
        }
      },
      "questioning": {
        "plaintiff": {
          "x": 25,
          "y": 665,
          "width": 263,
          "height": 302
        },
        "judge": {
          "x": 326,
          "y": 665,
          "width": 291,
          "height": 302
        },
        "defendant": {
          "x": 665,
          "y": 665,
          "width": 277,
          "height": 302
        }
      },
      "confident": {
        "plaintiff": {
          "x": 16,
          "y": 993,
          "width": 273,
          "height": 302
        },
        "judge": {
          "x": 326,
          "y": 993,
          "width": 291,
          "height": 302
        },
        "defendant": {
          "x": 662,
          "y": 993,
          "width": 288,
          "height": 302
        }
      },
      "shocked": {
        "plaintiff": {
          "x": 19,
          "y": 1321,
          "width": 278,
          "height": 288
        },
        "judge": {
          "x": 326,
          "y": 1321,
          "width": 291,
          "height": 288
        },
        "defendant": {
          "x": 662,
          "y": 1321,
          "width": 288,
          "height": 288
        }
      }
    }
  }
} as const satisfies Record<'everyday' | 'city' | 'night', PixelAtlas>;

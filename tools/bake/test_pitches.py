import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pitches import rings


def point(lat, lon):
    return {"lat": lat, "lon": lon}


def way(coordinates, role="outer"):
    return {
        "role": role,
        "geometry": [point(*coordinate) for coordinate in coordinates],
    }


class RingsTests(unittest.TestCase):

    def test_assembles_shuffled_and_reversed_ways(self):
        a, b, c, d = (0, 0), (0, 1), (1, 1), (1, 0)

        relation = {
            "members": [
                way([c, d]),
                way([d, a]),
                way([c, b]),
                way([a, b]),
            ]
        }

        result = rings(relation)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0][0], result[0][-1])
        self.assertEqual(set(result[0][:-1]), {a, b, c, d})

    def test_keeps_multiple_outer_rings(self):
        first = [(0, 0), (0, 1), (1, 1), (1, 0), (0, 0)]
        second = [(2, 2), (2, 3), (3, 3), (3, 2), (2, 2)]
        inner = [(0.2, 0.2), (0.2, 0.4), (0.4, 0.4), (0.2, 0.2)]

        result = rings({
            "members": [
                way(first),
                way(inner, "inner"),
                way(second),
            ]
        })

        self.assertEqual(len(result), 2)

    def test_discards_incomplete_boundaries(self):
        relation = {
            "members": [
                way([(0, 0), (0, 1)]),
                way([(0, 1), (1, 1)]),
                way([(1, 1), (1, 0)]),
            ]
        }

        self.assertEqual(rings(relation), [])

    def test_ignores_invalid_coordinates(self):
        closed = [(0, 0), (0, 1), (1, 1), (1, 0), (0, 0)]

        relation = {
            "members": [
                way(closed),
                {
                    "role": "outer",
                    "geometry": [
                        point(1, float("nan")),
                        point(0, 0),
                    ],
                },
                {
                    "role": "outer",
                    "geometry": [{"lat": 1}],
                },
            ]
        }

        self.assertEqual(len(rings(relation)), 1)

    def test_validates_standalone_ways(self):
        valid = [(0, 0), (0, 1), (1, 1), (1, 0), (0, 0)]
        invalid = [(0, 0), (0, 1), (1, 1)]
        degenerate = [(0, 0), (0, 1), (0, 0), (0, 1), (0, 0)]

        self.assertEqual(
            len(rings({"geometry": [point(*p) for p in valid]})), 1
        )

        self.assertEqual(
            rings({"geometry": [point(*p) for p in invalid]}), []
        )

        self.assertEqual(
            rings({"geometry": [point(*p) for p in degenerate]}), []
        )


if __name__ == "__main__":
    unittest.main()

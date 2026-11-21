"""Derive compact crossing geometries from official road axes."""
from itertools import combinations
from math import cos, degrees, hypot, radians, sin, sqrt

from shapely import get_parts
from shapely.errors import GEOSException
from shapely.geometry import box, shape


AXIS_TYPES = ('LineString', 'MultiLineString')
MAX_CROSSING_DIAMETER_M = 80
WGS84_A = 6378137.0
WGS84_ECCENTRICITY_SQUARED = 6.6943799901413165e-3


def _meters_per_radian(latitude):
    latitude = radians(latitude)
    eccentricity = WGS84_ECCENTRICITY_SQUARED
    scale = sqrt(1 - eccentricity * sin(latitude)**2)
    east = WGS84_A / scale * cos(latitude)
    north = WGS84_A * (1 - eccentricity) / scale**3
    return east, north


def _distance_meters(first, second):
    longitude, latitude = first
    other_longitude, other_latitude = second
    east, north = _meters_per_radian((latitude + other_latitude) / 2)
    return hypot(east * radians(other_longitude - longitude), north * radians(other_latitude - latitude))


def _locally_connected(first, second, crossing):
    west, south, east, north = crossing.bounds
    x_scale, y_scale = _meters_per_radian((south + north) / 2)
    # Allow the original road network to connect crossings inside their bounds
    # plus half the permitted diameter on each side. Cut any farther detours.
    padding = MAX_CROSSING_DIAMETER_M / 2
    x_pad, y_pad = degrees(padding / x_scale), degrees(padding / y_scale)
    window = box(west - x_pad, south - y_pad, east + x_pad, north + y_pad)
    first_parts, second_parts = (
        [part for part in get_parts(axis.intersection(window)) if part.geom_type == 'LineString']
        for axis in (first, second)
    )
    # Each crossing belongs to a part of the first axis. They must all be
    # reachable through touching or crossing axis parts within the window.
    involved = {index for index, part in enumerate(first_parts)
                if any(part.intersects(other) for other in second_parts)}
    if not involved:
        return False
    parts = first_parts + second_parts
    start = min(involved)
    pending = [start]
    unreached = set(range(len(parts))) - {start}
    while pending and not involved.isdisjoint(unreached):
        part = parts[pending.pop()]
        touching = {index for index in unreached if part.intersects(parts[index])}
        unreached.difference_update(touching)
        pending.extend(touching)
    return involved.isdisjoint(unreached)


def intersection_geometry(first: dict, second: dict) -> dict | None:
    """Return the real point intersections of two WGS84 axes in one crossing."""
    if any(axis.get('type') not in AXIS_TYPES for axis in (first, second)):
        return None
    try:
        first_axis, second_axis = shape(first), shape(second)
        if not first_axis.is_valid or not second_axis.is_valid:
            return None
        crossing = first_axis.intersection(second_axis)

        # A shared line or a mixture of line and point intersections is ambiguous.
        if crossing.is_empty or crossing.geom_type not in ('Point', 'MultiPoint'):
            return None
        points = [crossing] if crossing.geom_type == 'Point' else crossing.geoms
        positions = [(point.x, point.y) for point in points]
        if any(_distance_meters(a, b) > MAX_CROSSING_DIAMETER_M for a, b in combinations(positions, 2)):
            return None
        if len(positions) > 1 and not _locally_connected(first_axis, second_axis, crossing):
            return None
    except (GEOSException, KeyError, TypeError, ValueError):
        return None

    rounded = sorted({(round(x, 6), round(y, 6)) for x, y in positions})
    coordinates = [list(position) for position in rounded]
    if len(coordinates) == 1:
        return dict(type='Point', coordinates=coordinates[0])
    return dict(type='MultiPoint', coordinates=coordinates)

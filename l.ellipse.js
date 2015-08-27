/**
 * Copyright 2014 JD Fergason
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
(function (L) {
    var DEG_TO_RAD = Math.PI / 180;

    L.Ellipse = L.Path.extend({
        initialize: function (latlng, radii, tilt, options) {
            L.setOptions(this, options);
            this.setLatLng(latlng);

            if (tilt) {
                this._tiltDeg = tilt;
            } else {
                this._tiltDeg = 0;
            }

            if (radii) {
                this._mRadiusX = radii[0];
                this._mRadiusY = radii[1];
            }
            this._bounds = this.getBounds();
        },

        options: {
            ellipse: true,
            fill: true,
            startAngle: 0,
            endAngle: 359.9
        },

        setLatLng: function (latlng) {
            this._latlng = L.latLng(latlng);
            return this.redraw();
        },

        setRadius: function (radii) {
            this._mRadiusX = radii[0];
            this._mRadiusY = radii[1];
            return this.redraw();
        },

        setTilt: function (tilt) {
            this._tiltDeg = tilt;
            return this.redraw();
        },

        _project: function () {
            this._point = this._map.latLngToLayerPoint(this._latlng);
            this._projectLatlngs();

            // project bounds as well to use later for Canvas hit detection/etc.
            var w = this._clickTolerance(),
                p = new L.Point(w, -w);

            if (this._bounds.isValid()) {
                this._pxBounds = new L.Bounds(
                    this._map.latLngToLayerPoint(this._bounds.getSouthWest())._subtract(p),
                    this._map.latLngToLayerPoint(this._bounds.getNorthEast())._add(p));
            }
        },

        _projectLatlngs: function () {
            var lngRadius = this._getLngRadius(),
                latRadius = this._getLatRadius(),
                latlng = this._latlng,
                pointLeft = this._map.latLngToLayerPoint([latlng.lat, latlng.lng - lngRadius]),
                pointBelow = this._map.latLngToLayerPoint([latlng.lat - latRadius, latlng.lng]);

            this._point = this._map.latLngToLayerPoint(latlng);
            this._radiusX = Math.max(this._point.x - pointLeft.x, 1);
            this._radiusY = Math.max(pointBelow.y - this._point.y, 1);
            this._endPointParams = this._centerPointToEndPoint();
        },

        getBounds: function () {
            var lngRadius = this._getLngRadius(),
                latRadius = this._getLatRadius(),
                latlng = this._latlng;

            return new L.LatLngBounds(
                    [latlng.lat - latRadius, latlng.lng - lngRadius],
                    [latlng.lat + latRadius, latlng.lng + lngRadius]);
        },

        getLatLng: function () {
            return this._latlng;
        },

        getPathString: function () {
            var c = this._point,
                rx = this._radiusX,
                ry = this._radiusY,
                phi = this._tiltDeg,
                endPoint = this._endPointParams;

            if (this._checkIfEmpty()) {
                return '';
            }

            if (L.Browser.svg) {
                return 'M' + endPoint.x0 + ',' + endPoint.y0 +
                    'A' + rx + ',' + ry + ',' + phi + ',' +
                    endPoint.largeArc + ',' + endPoint.sweep + ',' +
                    endPoint.x1 + ',' + endPoint.y1 + ' z';
            } else {
                c._round();
                rx = Math.round(rx);
                ry = Math.round(ry);
                return 'AL ' + c.x + ',' + c.y + ' ' + rx + ',' + ry +
                    ' ' + phi + ',' + (65535 * 360);
            }
        },

        getRadius: function () {
            return new L.point(this._mRadiusX, this._mRadiusY);
        },

        _update: function () {
            if (!this._map) { return; }

            this._renderer._updatePoly(this, this.getPathString());
        },

        _empty: function () {
            return this._radius && !this._renderer._bounds.intersects(this._pxBounds);
        },

        // TODO Earth hardcoded, move into projection code!

        _centerPointToEndPoint: function () {
            // Convert between center point parameterization of an ellipse
            // too SVG's end-point and sweep parameters.  This is an
            // adaptation of the perl code found here:
            // http://commons.oreilly.com/wiki/index.php/SVG_Essentials/Paths
            var c = this._point,
                rx = this._radiusX,
                ry = this._radiusY,
                theta2 = (this.options.startAngle + this.options.endAngle) *
                        DEG_TO_RAD,
                theta1 = this.options.startAngle * DEG_TO_RAD,
                delta = this.options.endAngle,
                phi = this._tiltDeg * DEG_TO_RAD;

            // Determine start and end-point coordinates
            var x0 = c.x + Math.cos(phi) * rx * Math.cos(theta1) +
                Math.sin(-phi) * ry * Math.sin(theta1);
            var y0 = c.y + Math.sin(phi) * rx * Math.cos(theta1) +
                Math.cos(phi) * ry * Math.sin(theta1);

            var x1 = c.x + Math.cos(phi) * rx * Math.cos(theta2) +
                Math.sin(-phi) * ry * Math.sin(theta2);
            var y1 = c.y + Math.sin(phi) * rx * Math.cos(theta2) +
                Math.cos(phi) * ry * Math.sin(theta2);

            var largeArc = (delta > 180) ? 1 : 0;
            var sweep = (delta > 0) ? 1 : 0;

            return {'x0': x0, 'y0': y0, 'tilt': phi, 'largeArc': largeArc,
                    'sweep': sweep, 'x1': x1, 'y1': y1};
        },

        _getLatRadius: function () {
            return (this._mRadiusY / 40075017) * 360;
        },

        _getLngRadius: function () {
            return ((this._mRadiusX / 40075017) * 360) / Math.cos(DEG_TO_RAD * this._latlng.lat);
        },

        _updatePathViewport: function () {
            var p = L.Path.CLIP_PADDING,
                size = this._map.getSize(),
                panePos = L.DomUtil.getPosition(this._map._mapPane),
                min = panePos.multiplyBy(-1)._subtract(size.multiplyBy(p)._round()),
                max = min.add(size.multiplyBy(1 + p * 2)._round());

            this._pathViewport = new L.Bounds(min, max);
        },

        _checkIfEmpty: function () {
            if (!this._map) {
                return false;
            }
            this._updatePathViewport();
            var vp = this._pathViewport,
                r = this._radiusX,
                p = this._point;

            return p.x - r > vp.max.x || p.y - r > vp.max.y ||
                p.x + r < vp.min.x || p.y + r < vp.min.y;
        }
    });

    // save original getPathString function to draw a full circle.
    var originalSVGUpdatePoly = L.SVG.prototype._updatePoly;
    var originalCanvasUpdatePoly = L.Canvas.prototype._updatePoly;

    L.SVG.include({
        _updatePoly: function (layer, closed) {
            if (layer._parts && typeof layer.options.ellipse === 'undefined') {
                return originalSVGUpdatePoly.call(this, layer, closed);
            }

            this._setPath(layer, closed);
        },
    });

    L.Canvas.include({
        _updatePoly: function (layer, closed) {
            if (typeof layer.options.ellipse === 'undefined') {
                originalCanvasUpdatePoly(layer, closed);
            }
//             TODO draw layers
        },
    });

    L.ellipse = function (latlng, radii, tilt, options) {
        return new L.Ellipse(latlng, radii, tilt, options);
    };

})(L);

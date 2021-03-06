L.Edit = L.Edit || {};

/**
 * @class L.Edit.Polyline
 * @aka L.Edit.Poly
 * @aka Edit.Poly
 */
L.Edit.Poly = L.Handler.extend({
	options: {
		moveIcon: new L.DivIcon({
			iconSize: new L.Point(8, 8),
			className: 'leaflet-div-icon leaflet-editing-icon leaflet-edit-move'
		}),
		touchMoveIcon: new L.DivIcon({
			iconSize: new L.Point(20, 20),
			className: 'leaflet-div-icon leaflet-editing-icon leaflet-edit-move leaflet-touch-icon'
		})
	},

	// @method initialize(): void
	initialize: function (poly, options) {
		if (!L.Browser.pointer) {
			this.options.moveIcon = this.options.touchMoveIcon;
		}
		this.latlngs = [poly._latlngs];
		if (poly._holes) {
			this.latlngs = this.latlngs.concat(poly._holes);
		}

		this._poly = poly;
		L.setOptions(this, options);

		this._poly.on('revert-edited', this._updateLatLngs, this);
	},

	// Compatibility method to normalize Poly* objects
	// between 0.7.x and 1.0+
	_defaultShape: function () {
		if (!L.Polyline._flat) {
			return this._poly._latlngs;
		}
		return L.Polyline._flat(this._poly._latlngs) ? this._poly._latlngs : this._poly._latlngs[0];
	},

	_eachVertexHandler: function (callback) {
		for (var i = 0; i < this._verticesHandlers.length; i++) {
			callback(this._verticesHandlers[i]);
		}
	},

	// @method addHooks(): void
	// Add listener hooks to this handler
	addHooks: function () {
        this._initHandlers();
        this._eachVertexHandler(function (handler) {
            handler.addHooks();
        });
        this._initMarkers();
        
        if (this._poly._map) {
            this._map = this._poly._map;
            
            this._map.fire(L.Draw.Event.EDITHOOK, {
                'editHandler': this,
                'layer': this._poly
            });
        }
	},

	// @method removeHooks(): void
	// Remove listener hooks from this handler
	removeHooks: function () {
		this._eachVertexHandler(function (handler) {
			handler.removeHooks();
		});
		this._releaseMarkers();
	},

	// @method updateMarkers(): void
	// Fire an update for each vertex handler
	updateMarkers: function () {
		this._eachVertexHandler(function (handler) {
			handler.updateMarkers();
		});
	},

	_initHandlers: function () {
		this._verticesHandlers = [];
		for (var i = 0; i < this.latlngs.length; i++) {
			this._verticesHandlers.push(new L.Edit.PolyVerticesEdit(this._poly, this.latlngs[i], this.options));
		}
	},

	_updateLatLngs: function (e) {
		this.latlngs = [e.layer._latlngs];
		if (e.layer._holes) {
			this.latlngs = this.latlngs.concat(e.layer._holes);
		}
	},

	_createMoveMarker: function (latlng, icon) {
		var marker = new L.Marker.Touch(latlng, {
			draggable: true,
			icon: icon,
			zIndexOffset: 10
		});

		marker._origLatLng = latlng;

		// for polyline snap
		marker._owner = this._poly._leaflet_id;
		return marker;
	},

	_initMarkers: function () {
		this._poly.on('edit', this._onEdit, this);

		if (this._poly._map) {
			this._map = this._poly._map;

			if (!this._markerGroup) {
				this._markerGroup = new L.LayerGroup();
				this._map.addLayer(this._markerGroup);
			}

			if (!this._moveMarker) {
				var latlng = this._getMoveMarkerLatLng();
				this._moveMarker = this._createMoveMarker(latlng, this.options.moveIcon);

				this._moveMarker
					.on('dragstart', this._onMarkerDragStart, this)
					.on('drag', this._onMarkerDrag, this)
					.on('dragend', this._onMarkerDragEnd, this)
					.on('touchstart', this._onTouchStart, this)
					.on('touchmove', this._onTouchMove, this)
					.on('MSPointerMove', this._onTouchMove, this)
					.on('touchend', this._onTouchEnd, this)
					.on('MSPointerUp', this._onTouchEnd, this);

				this._markerGroup.addLayer(this._moveMarker);
			}
		}
	},

	_releaseMarkers: function () {
		this._moveMarker
			.off('dragstart', this._onMarkerDragStart, this)
			.off('drag', this._onMarkerDrag, this)
			.off('dragend', this._onMarkerDragEnd, this)
			.off('touchstart', this._onTouchStart, this)
			.off('touchmove', this._onTouchMove, this)
			.off('MSPointerMove', this._onTouchMove, this)
			.off('touchend', this._onTouchEnd, this)
			.off('MSPointerUp', this._onTouchEnd, this);

		this._markerGroup.removeLayer(this._moveMarker);
		delete this._moveMarker;

		this._markerGroup.clearLayers();
		this._map.removeLayer(this._markerGroup);
		delete this._markerGroup;

		delete this._map;
		this._poly.off('edit', this._onEdit, this);
	},

	_fireEdit: function () {
		this._poly.edited = true;
		this._poly.fire('edit');

		if (this._poly._map) {
			this._poly._map.fire(L.Draw.Event.EDITDONE);
		}
	},

	_onEdit: function (e) {
		if (this._moveMarker) {
			var latlng = this._getMoveMarkerLatLng();

			this._moveMarker.setLatLng(latlng);
			this._moveMarker._origLatLng = latlng;

			if (this.hasOwnProperty('_markers')) {
				this.updateMarkers();
			}

			this._poly.redraw();
		}
	},

	_onMarkerDragStart: function (e) {
		var marker = e.target;

		L.DomUtil.addClass(marker._icon, 'leaflet-active-editing-icon');
		this._originalLatLng = this._getMoveMarkerLatLng();
		this._poly.fire('editstart');
	},

	_onMarkerDrag: function (e) {
		var marker = e.target,
			latlng = marker.getLatLng();

		this._move(latlng);
		this._poly.fire('editdrag');
	},

	_onMarkerDragEnd: function (e) {
		var marker = e.target;

		L.DomUtil.removeClass(marker._icon, 'leaflet-active-editing-icon');
		this._fireEdit();
	},

	_onTouchStart: function (e) {
		var marker = e.target;

		L.DomUtil.addClass(marker._icon, 'leaflet-active-editing-icon');
		this._originalLatLng = this._getMoveMarkerLatLng();
		this._poly.fire('editstart');
	},

	_onTouchMove: function (e) {
		var layerPoint = this._map.mouseEventToLayerPoint(e.originalEvent.touches[0]),
			latlng = this._map.layerPointToLatLng(layerPoint);

		this._move(latlng);
		return false;
	},

	_onTouchEnd: function (e) {
		var marker = e.target;

		L.DomUtil.removeClass(marker._icon, 'leaflet-active-editing-icon');
		this._fireEdit();
	},

	_move: function (latlng) {
		var moveMarker = this._moveMarker;
		var latlngs = this._defaultShape();

		var latMove = latlng.lat - moveMarker._origLatLng.lat;
		var lngMove = latlng.lng - moveMarker._origLatLng.lng;

		for (var i = 0; i < latlngs.length; ++i) {
			latlngs[i].lat += latMove;
			latlngs[i].lng += lngMove;
		}

		moveMarker.setLatLng(latlng);
		moveMarker._origLatLng = latlng;

		this._poly.redraw();
		this.updateMarkers();

		this._map.fire(L.Draw.Event.EDITMOVE, {
			layer: this._poly,
			editHandler: this,
			originalLatLng: this._originalLatLng.clone(),
			newLatLng: latlng.clone(),
			latMove: latMove,
			lngMove: lngMove,
			editType: 'editpoly/Move',
		});
		this._poly.fire('move');
	},

	_getMoveMarkerLatLng: function () {
		var latlngs = this._defaultShape();

		if (this._poly instanceof L.Polygon) {
			var b = new L.LatLngBounds(latlngs);
			var c = b.getCenter();
			if (b.contains(c)) {
				return b.getCenter();
			}
		}

		var p1 = this._map.project(latlngs[0]);
		var p2 = this._map.project(latlngs[1]);

		return this._map.unproject(p1._multiplyBy(0.75)._add(p2._multiplyBy(0.25)));
	}
});

/**
 * @class L.Edit.PolyVerticesEdit
 * @aka Edit.PolyVerticesEdit
 */
L.Edit.PolyVerticesEdit = L.Handler.extend({
	options: {
		icon: new L.DivIcon({
			iconSize: new L.Point(8, 8),
			className: 'leaflet-div-icon leaflet-editing-icon'
		}),
		touchIcon: new L.DivIcon({
			iconSize: new L.Point(20, 20),
			className: 'leaflet-div-icon leaflet-editing-icon leaflet-touch-icon'
		}),
		drawError: {
			color: '#b00b00',
			timeout: 1000
		}


	},

	// @method intialize(): void
	initialize: function (poly, latlngs, options) {
		// if touch, switch to touch icon
		if (!L.Browser.pointer) {
			this.options.icon = this.options.touchIcon;
		}
		this._poly = poly;

		if (options && options.drawError) {
			options.drawError = L.Util.extend({}, this.options.drawError, options.drawError);
		}

		this._latlngs = latlngs;

		L.setOptions(this, options);
	},

	// Compatibility method to normalize Poly* objects
	// between 0.7.x and 1.0+
	_defaultShape: function () {
		if (!L.Polyline._flat) {
			return this._latlngs;
		}
		return L.Polyline._flat(this._latlngs) ? this._latlngs : this._latlngs[0];
	},

	// @method addHooks(): void
	// Add listener hooks to this handler.
	addHooks: function () {
		var poly = this._poly;

		if (!(poly instanceof L.Polygon)) {
			poly.options.fill = false;
			if (poly.options.editing) {
				poly.options.editing.fill = false;
			}
		}

		poly.setStyle(poly.options.editing);

		if (this._poly._map) {
			this._map = this._poly._map; // Set map

			if (!this._markerGroup) {
				this._initMarkers();
			}
			this._poly._map.addLayer(this._markerGroup);
                
            this._map.fire(L.Draw.Event.EDITHOOK, {
                'layer': poly,
                'vertex': true,
                'editHandler': this
            });
		}
	},

	// @method removeHooks(): void
	// Remove listener hooks from this handler.
	removeHooks: function () {
		var poly = this._poly;

		poly.setStyle(poly.options.original);

		if (poly._map) {
			poly._map.removeLayer(this._markerGroup);
			delete this._markerGroup;
			delete this._markers;
		}
	},

	// @method updateMarkers(): void
	// Clear markers and update their location
	updateMarkers: function () {
		this._markerGroup.clearLayers();
		this._initMarkers();
	},

	_initMarkers: function () {
		if (!this._markerGroup) {
			this._markerGroup = new L.LayerGroup();
		}
		this._markers = [];

		var latlngs = this._defaultShape(),
			i, j, len, marker;

		for (i = 0, len = latlngs.length; i < len; i++) {

			marker = this._createMarker(latlngs[i], i);
			marker.on('click', this._onMarkerClick, this);
			this._markers.push(marker);
		}

		var markerLeft, markerRight;

		for (i = 0, j = len - 1; i < len; j = i++) {
			if (i === 0 && !(L.Polygon && (this._poly instanceof L.Polygon))) {
				continue;
			}

			markerLeft = this._markers[j];
			markerRight = this._markers[i];

			this._createMiddleMarker(markerLeft, markerRight);
			this._updatePrevNext(markerLeft, markerRight);
		}
	},

	_createMarker: function (latlng, index) {
		// Extending L.Marker in TouchEvents.js to include touch.
		var marker = new L.Marker.Touch(latlng, {
			draggable: true,
			icon: this.options.icon,
		});

		marker._origLatLng = latlng;
		marker._index = index;

		marker
			.on('dragstart', this._onMarkerDragStart, this)
			.on('drag', this._onMarkerDrag, this)
			.on('dragend', this._onMarkerDragEnd, this)
			.on('touchmove', this._onTouchMove, this)
			.on('touchend', this._onMarkerDragEnd, this)
			.on('MSPointerMove', this._onTouchMove, this)
			.on('MSPointerUp', this._onMarkerDragEnd, this);

		this._markerGroup.addLayer(marker);

		return marker;
	},

	_onMarkerDragStart: function (e) {
		L.DomUtil.addClass(e.target._icon, 'leaflet-active-editing-icon');
		this._dragIndex = e.target._index;
		this._dragStartLocation = e.target.getLatLng().clone();
		this._dragEndLocation = null;
		this._poly.fire('editstart');
	},

	_onMarkerDragEnd: function (e) {
		L.DomUtil.removeClass(e.target._icon, 'leaflet-active-editing-icon');
		this._fireEdit(e);
	},

	_spliceLatLngs: function () {
		var latlngs = this._defaultShape();
		var removed = [].splice.apply(latlngs, arguments);
		this._poly._convertLatLngs(latlngs, true);
		this._poly.redraw();
		return removed;
	},

	_removeMarker: function (marker) {
		var i = marker._index;

		this._markerGroup.removeLayer(marker);
		this._markers.splice(i, 1);
		this._spliceLatLngs(i, 1);
		this._updateIndexes(i, -1);

		marker
			.off('dragstart', this._onMarkerDragStart, this)
			.off('drag', this._onMarkerDrag, this)
			.off('dragend', this._fireEdit, this)
			.off('touchmove', this._onMarkerDrag, this)
			.off('touchend', this._fireEdit, this)
			.off('click', this._onMarkerClick, this)
			.off('MSPointerMove', this._onTouchMove, this)
			.off('MSPointerUp', this._fireEdit, this);
	},

	_fireEdit: function (e, editType, editInfo) {
		this._poly.edited = true;
		this._poly.fire('edit');

		// if fired directly by event
		if ((typeof(editType) === 'undefined') || (editType === null)) {
			editType = 'editvertex/Move';
		}

		// if fired directly by event
		if (((typeof(editInfo) === 'undefined') || (editInfo === null)) && (this._dragStartLocation !== null)) {
			editInfo = {
				index: this._dragIndex,
				originalLatLng: this._dragStartLocation.clone(),
				newLatLng: this._dragEndLocation.clone()
			};
		}

		// not sure how this could happen, so if it does, just bail
		else if ((typeof(editInfo) === 'undefined') || (editInfo === null)) {
			return;
		}

		this._poly._map.fire(L.Draw.Event.EDITVERTEX, {
			editHandler: this,
			layers: this._markerGroup,
			editType: editType,
			editInfo: editInfo,
			poly: this._poly,
			marker: e.target
		});
	},

	_onMarkerDrag: function (e) {
		var marker = e.target;
		var poly = this._poly;
		var newLatLng = L.LatLngUtil.pointToBounds(this._map.options.maxBounds, marker._latlng);
		this._dragEndLocation = newLatLng.clone();
		this._dragIndex = marker._index;
		marker.setLatLng(newLatLng);
		L.extend(marker._origLatLng, marker._latlng);

		if (marker._middleLeft) {
			marker._middleLeft.setLatLng(this._getMiddleLatLng(marker._prev, marker));
		}
		if (marker._middleRight) {
			marker._middleRight.setLatLng(this._getMiddleLatLng(marker, marker._next));
		}

		if (poly.options.poly) {
			var tooltip = poly._map._editTooltip; // Access the tooltip

			// If we don't allow intersections and the polygon intersects
			if (!poly.options.poly.allowIntersection && poly.intersects()) {

				var originalColor = poly.options.color;
				poly.setStyle({ color: this.options.drawError.color });

				// Manually trigger 'dragend' behavior on marker we are about to remove
				// WORKAROUND: introduced in 1.0.0-rc2, may be related to #4484
				if (L.version.indexOf('0.7') !== 0) {
					marker.dragging._draggable._onUp(e);
				}
				this._errorShown = true;
				marker.setLatLng(this._dragStartLocation);
				this._onMarkerDrag({ 'target': marker });
				if (tooltip) {
					tooltip.updateContent({
						text: L.drawLocal.draw.handlers.polyline.error
					});
				}

				// Reset everything back to normal after a second
				setTimeout(function () {
					poly.setStyle({ color: originalColor });
					if (tooltip) {
						tooltip.updateContent({
							text: L.drawLocal.edit.handlers.edit.tooltip.text,
							subtext: L.drawLocal.edit.handlers.edit.tooltip.subtext
						});
					}
					this._errorShown = false;
				}, 1000);

				this._poly._map.fire(L.Draw.Event.EDITREVERT);
			}
		}

		this._poly.redraw();
		this._poly.fire('editdrag');
	},

	_onMarkerClick: function (e) {

		var minPoints = L.Polygon && (this._poly instanceof L.Polygon) ? 4 : 3,
			marker = e.target;

		// If removing this point would create an invalid polyline/polygon don't remove
		if (this._defaultShape().length < minPoints) {
			return;
		}

		var originalLatLng = marker._latlng.clone();
		var originalIndex = marker._index;

		var originalLatLng = marker._latlng.clone();
		var originalIndex = marker._index;

		// remove the marker
		this._removeMarker(marker);

		// update prev/next links of adjacent markers
		this._updatePrevNext(marker._prev, marker._next);

		// remove ghost markers near the removed marker
		if (marker._middleLeft) {
			this._markerGroup.removeLayer(marker._middleLeft);
		}
		if (marker._middleRight) {
			this._markerGroup.removeLayer(marker._middleRight);
		}

		// create a ghost marker in place of the removed one
		if (marker._prev && marker._next) {
			this._createMiddleMarker(marker._prev, marker._next);

		} else if (!marker._prev) {
			marker._next._middleLeft = null;

		} else if (!marker._next) {
			marker._prev._middleRight = null;
		}

		this._fireEdit({ 'target': marker }, 'editvertex/Remove', {
			index: originalIndex,
			originalLatLng: originalLatLng,
			prevIndex: marker._prev._index,
			nextIndex: marker._next._index
		});
	},

	_onTouchMove: function (e) {

		var layerPoint = this._map.mouseEventToLayerPoint(e.originalEvent.touches[0]),
			latlng = this._map.layerPointToLatLng(layerPoint),
			marker = e.target;

		L.extend(marker._origLatLng, latlng);

		if (marker._middleLeft) {
			marker._middleLeft.setLatLng(this._getMiddleLatLng(marker._prev, marker));
		}
		if (marker._middleRight) {
			marker._middleRight.setLatLng(this._getMiddleLatLng(marker, marker._next));
		}

		this._poly.redraw();
		this.updateMarkers();
	},

	_updateIndexes: function (index, delta) {
		this._markerGroup.eachLayer(function (marker) {
			if (marker._index > index) {
				marker._index += delta;
			}
		});
	},

	_createMiddleMarker: function (marker1, marker2, fixedLL, fixedIndex) {
		var onClick;
		var onDragStart;
		var onDragEnd;
		var latlng;

		if (fixedLL !== undefined) {
			latlng = fixedLL;
		}
		else {
			latlng = this._getMiddleLatLng(marker1, marker2);
		}

		varmarker = this._createMarker(latlng);

		marker.setOpacity(0.6);

		marker1._middleRight = marker2._middleLeft = marker;

		onDragStart = function () {
			marker.off('touchmove', onDragStart, this);
			var i = marker2._index;

			if (fixedIndex !== undefined) {
				i = fixedIndex;
			}

			marker._index = i;

			marker
				.off('click', onClick, this)
				.on('click', this._onMarkerClick, this);

			latlng.lat = marker.getLatLng().lat;
			latlng.lng = marker.getLatLng().lng;

			this._spliceLatLngs(i, 0, latlng);
			this._markers.splice(i, 0, marker);

			marker.setOpacity(1);
			L.DomUtil.addClass(marker._icon, 'leaflet-active-editing-icon');

			this._updateIndexes(i, 1);
			marker2._index++;
			this._updatePrevNext(marker1, marker);
			this._updatePrevNext(marker, marker2);

			this._poly.fire('editstart');
		};

		onDragEnd = function () {
			L.DomUtil.removeClass(marker._icon, 'leaflet-active-editing-icon');

			marker.off('dragstart', onDragStart, this);
			marker.off('dragend', onDragEnd, this);
			marker.off('touchmove', onDragStart, this);

			this._createMiddleMarker(marker1, marker);
			this._createMiddleMarker(marker, marker2);
		};

		onClick = function () {
			onDragStart.call(this);
			onDragEnd.call(this);
			this._fireEdit({ 'target': marker }, 'editvertex/Add', {
				marker: marker,
				index: marker._index,
				originalLatLng: latlng,
				prevIndex: marker._prev._index,
				nextIndex: marker._next._index
			});
		};

		marker
			.on('click', onClick, this)
			.on('dragstart', onDragStart, this)
			.on('dragend', onDragEnd, this)
			.on('touchmove', onDragStart, this);

		this._markerGroup.addLayer(marker);
		return marker;
	},

	_updatePrevNext: function (marker1, marker2) {
		if (marker1) {
			marker1._next = marker2;
		}
		if (marker2) {
			marker2._prev = marker1;
		}
	},

	_getMiddleLatLng: function (marker1, marker2) {
		var map = this._poly._map,
			p1 = map.project(marker1.getLatLng()),
			p2 = map.project(marker2.getLatLng());

		return map.unproject(p1._add(p2)._divideBy(2));
	}
});

L.Polyline.addInitHook(function () {

	// Check to see if handler has already been initialized. This is to support versions of Leaflet that still have L.Handler.PolyEdit
	if (this.editing) {
		return;
	}

	if (L.Edit.Poly) {

		this.editing = new L.Edit.Poly(this, this.options.poly);

		if (this.options.editable) {
			this.editing.enable();
		}
	}

	this.on('add', function () {
		if (this.editing && this.editing.enabled()) {
			this.editing.addHooks();
		}
	});

	this.on('remove', function () {
		if (this.editing && this.editing.enabled()) {
			this.editing.removeHooks();
		}
	});
});

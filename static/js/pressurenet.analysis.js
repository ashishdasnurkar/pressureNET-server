(function() {

    var global = this;

    var PressureNET = (global.PressureNET || (global.PressureNET = {}));

    // Globals
    PressureNET.readings_url = '';
    PressureNET.map = null;
    PressureNET.geohash_key_length = 3;
    PressureNET.gradient = new Rainbow();
    PressureNET.gradient.setSpectrum('#FF0000', '#0000FF');
    PressureNET.rectangles = [];

    PressureNET.min_pressure = 0;
    PressureNET.max_pressure = 1500;
    PressureNET.min_hash_length = 3;
    PressureNET.max_hash_length = 7;
    PressureNET.min_zoom = 3;
    PressureNET.max_zoom = 14;

    var reading_marker_colour = 'FF0000';
    PressureNET.reading_marker_image = new google.maps.MarkerImage(
        'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|' + reading_marker_colour,
        new google.maps.Size(21, 34),
        new google.maps.Point(0,0),
        new google.maps.Point(10, 34)
    );

    var bin_marker_colour = '0000FF';
    PressureNET.bin_marker_image = new google.maps.MarkerImage(
        'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|' + bin_marker_colour,
        new google.maps.Size(21, 34),
        new google.maps.Point(0,0),
        new google.maps.Point(10, 34)
    );

    // Initialization
    PressureNET.initialize = function(config) {
        PressureNET.readings_url = config.readings_url;

        PressureNET.init_map();
        PressureNET.get_location();
        PressureNET.load_data();
    }

    PressureNET.init_map = function() {
        var map_options = {
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            minZoom: 3, 
            maxZoom: 14
        };
        PressureNET.map = new google.maps.Map(document.getElementById('map_canvas'), map_options);

        //var weatherLayer = new google.maps.weather.WeatherLayer({
        //  temperatureUnits: google.maps.weather.TemperatureUnit.CELSIUS
        //});
        //weatherLayer.setMap(PressureNET.map);

        //var cloudLayer = new google.maps.weather.CloudLayer();
        //cloudLayer.setMap(PressureNET.map);
        google.maps.event.addListener(PressureNET.map, 'zoom_changed', function() {
            PressureNET.render_readings();
        });
        google.maps.event.addListener(PressureNET.map, 'dragend', function() {
            PressureNET.render_readings();
        });

    }

    PressureNET.get_location = function() {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(function (position) {
                var latitude = position.coords.latitude;
                var longitude = position.coords.longitude;
                PressureNET.set_map_position(latitude, longitude, 10);
            });
        }
    }

    PressureNET.set_map_position = function(latitude, longitude, zoom_level) {
        PressureNET.map.setZoom(zoom_level);
        PressureNET.map.panTo(new google.maps.LatLng(latitude, longitude));
    }

    PressureNET.add_marker = function(image, body, position) {
        var infowindow = new google.maps.InfoWindow({
            content: body
        });

        var marker = new google.maps.Marker({
            map: PressureNET.map,
            icon: image,
            position: position,
        });

        google.maps.event.addListener(marker, 'click', function() {
            infowindow.open(
                PressureNET.map,
                marker
            );
        });
    }

    PressureNET.clear_rectangles = function () {
        _(PressureNET.rectangles).each(function (rectangle) {
            rectangle.setMap(null);
        });
    }

    PressureNET.filter_outliers = function (readings) {
        return _(readings).filter(function (reading) {
            return (reading.reading > PressureNET.min_pressure) && (reading.reading < PressureNET.max_pressure); 
        });
    }

    PressureNET.filter_visible = function (readings) {
        return _(readings).filter(function (reading) {
            var visible_bounds = PressureNET.map.getBounds();
            var position = new google.maps.LatLng(reading.latitude, reading.longitude);
            return visible_bounds.contains(position); 
        });
    }

    // Load data
    PressureNET.load_data = function() {
        end_time = new Date().getTime();
        start_time = end_time - 3600000;

        var query_params = {
            format: 'json',
            start_time: start_time,
            end_time: end_time,
            limit: 100000
        };

        $.ajax({
            url: PressureNET.readings_url,
            data: query_params,
            dataType: 'json',
            success: function(readings, status) {
                PressureNET.readings = PressureNET.filter_outliers(readings);
                PressureNET.render_readings();
            }
        });
    }

    PressureNET.update_visible_scale = function () {
        var zoom = PressureNET.map.getZoom();
        var zoom_ratio = (zoom - PressureNET.min_zoom) / PressureNET.max_zoom;

        var hash_length_scale = PressureNET.max_hash_length - PressureNET.min_hash_length;
        var rectangle_scale = Math.round((zoom_ratio * hash_length_scale)) + PressureNET.min_hash_length;
        PressureNET.geohash_key_length = rectangle_scale;
    }

    PressureNET.render_readings = function () {
        PressureNET.clear_rectangles();
        PressureNET.update_visible_scale();

        var readings = PressureNET.filter_visible(PressureNET.readings);
        var reading_bins = {};

        _(readings).each(function (reading) {
            var bin_key = encodeGeoHash(reading.latitude, reading.longitude).substring(0, PressureNET.geohash_key_length);

            if (reading_bins[bin_key]) {
                reading_bins[bin_key].readings.push(reading);
            } else {
                reading_bins[bin_key] = {
                    readings: [reading]
                };
            }

            //var marker_body = 'Latitude: ' + reading.latitude + '<br>Longitude: ' + reading.longitude + '<br>Bin: ' + bin_key + '<br>Reading: ' + reading.reading;

            //PressureNET.add_marker(
            //    PressureNET.reading_marker_image,
            //    marker_body,
            //    new google.maps.LatLng(reading.latitude, reading.longitude)
            //)

        });

        _(reading_bins).each(function (bin) {
            bin.average = Stats.median(_(bin.readings).map(function (reading) { return reading.reading; })); 
        });

        PressureNET.reading_pressures = _(readings).map(function (reading) { return reading.reading; });
        var std_dev = Stats.stdev(PressureNET.reading_pressures);
        var median_pressure = Stats.median(PressureNET.reading_pressures);

        _(reading_bins).each(function (bin, bin_key) {
            var normalized_pressure = Math.round(Stats.sigmoid((bin.average - median_pressure) / std_dev) * 100);
            var bin_colour = PressureNET.gradient.colourAt(normalized_pressure);

            var decoded_key = decodeGeoHash(bin_key);
            var bottom_left = new google.maps.LatLng(decoded_key.latitude[1], decoded_key.longitude[0]);
            var top_right = new google.maps.LatLng(decoded_key.latitude[0], decoded_key.longitude[1]);

            var rectangle_options = {
                map: PressureNET.map,
                strokeWeight: 0,
                fillColor: bin_colour,
                fillOpacity: 0.35,
                bounds: new google.maps.LatLngBounds(
                    bottom_left,
                    top_right
                )
            };

            // Add the circle for this city to the map.
            PressureNET.rectangles.push(new google.maps.Rectangle(rectangle_options));

            //var marker_body = 'Key: ' + bin_key + '<br>Average: ' + bin.average + '<br>Points: ' + bin.readings.length + '<br>Colour: ' + bin_colour;;

            //PressureNET.add_marker(
            //    PressureNET.bin_marker_image,
            //    marker_body,
            //    bottom_left
            //)
        });

        PressureNET.update_control_panel();
    }

    PressureNET.update_control_panel = function () {
        $('#control_panel_num_readings').html(PressureNET.reading_pressures.length);
        $('#control_panel_min_pressure').html(_(PressureNET.reading_pressures).min());
        $('#control_panel_max_pressure').html(_(PressureNET.reading_pressures).max());
        $('#control_panel_mean_pressure').html(Stats.mean(PressureNET.reading_pressures));
        $('#control_panel_median_pressure').html(Stats.median(PressureNET.reading_pressures));
        $('#control_panel_standard_deviation').html(Stats.stdev(PressureNET.reading_pressures));
    }

}).call(this);

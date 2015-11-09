/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
 
var arrayBufferToFloat = function (ab) {
    var a = new Float32Array(ab);
    return a;
};

function arrayBuffer2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf));
}

var slope = function(value, min, max) {
	return (value-min)/(max-min);
};

var lerp = function(a, b, r) {
	return a + r*(b-a);
};

var BatteryTool = {};
BatteryTool.lipo_charge = [{v:3.0, charge:0}, {v:3.3, charge:5}, {v:3.6, charge:10},
                   {v:3.7, charge:20}, {v:3.75, charge:30}, {v:3.79, charge:40},
                   {v:3.83, charge:50}, {v:3.87, charge:60}, {v:3.92, charge:70},
                   {v:3.97, charge:80}, {v:4.1, charge:90}, {v:4.2, charge:100}];
BatteryTool.getIndex = function(voltage) {
    for (var i=1 ; i<BatteryTool.lipo_charge.length ; i++) {
        if (voltage<=BatteryTool.lipo_charge[i].v) {
            return i;
        }
    }
    return BatteryTool.lipo_charge.length-1;
};
BatteryTool.voltageToPcent = function(voltage) {
    var i = BatteryTool.getIndex(voltage);
    var r = slope(voltage, BatteryTool.lipo_charge[i-1].v, BatteryTool.lipo_charge[i].v);
    return Math.min(Math.max(lerp(BatteryTool.lipo_charge[i-1].charge, BatteryTool.lipo_charge[i].charge, r), 0.0), 100.0);
};

var dataToShare = {};
var ppmpcfValue;
var tempValue;
var humValue;
var serial = "";

var shareTimer = null;

var app = {
    // Application Constructor
    initialize: function() {
        this.bindEvents();
        $("#detailPage").hide();
        $("#ajaxLoader").hide();
        $("#shareContent").hide();
    },
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
        refreshButton.addEventListener('touchstart', this.refreshDeviceList, false);
        closeButton.addEventListener('touchstart', this.disconnect, false);
        deviceList.addEventListener('touchstart', this.connect, false); // assume not scrolling
        shareButton.addEventListener('touchstart', this.shareData, false);
        sendButton.addEventListener('touchstart', this.sendData, false);
        $("#autoShare").change(function() {
            if (this.checked) {
                $("#infos").html("Partage automatique activé.");
                if (shareTimer == null) {
                    shareTimer = setInterval(function() {
                        $("#infos").html("Partage en cours...");
                        if (ppmpcfValue && tempValue && humValue) {
                            dataToShare.ppmpcf = ppmpcfValue;
                            dataToShare.temperature = tempValue;
                            dataToShare.humidity = humValue;
                            
                            var onGPSSuccess = function(position) {
                                dataToShare.latitude = position.coords.latitude;
                                dataToShare.longitude = position.coords.longitude;
                                if (position.coords.altitude == null) {
                                    dataToShare.altitude = 0;
                                } else {
                                    dataToShare.altitude = position.coords.altitude;
                                }
                                if (position.timestamp !== undefined) {
                                    dataToShare.timestamp = position.timestamp;
                                } else {
                                    dataToShare.timestamp = new Date().getTime();
                                }
                                
                                $.ajax({
                                    url: "http://pmclab.fr:8043/addAll",
                                    type: 'PUT',
                                    data: JSON.stringify(dataToShare),
                                    contentType: 'application/json',
                                    success: function(result) {
                                        $("#infos").html("Données partagées automatiquement.");
                                    },
                                    error: function(xhr, status, error) {
                                        $("#autoShare").attr('checked', false);
                                        clearInterval(shareTimer);
                                        shareTimer = null;
                    		        	$("#infos").html("Echec du partage.");
                                    }
                                });
                            };
                            
                            var onGPSError = function(error) {
                                $("#autoShare").attr('checked', false);
                                clearInterval(shareTimer);
                                shareTimer = null;
                                $("#infos").html("Echec du partage.");
                            };
                            
                            navigator.geolocation.getCurrentPosition(onGPSSuccess, onGPSError);
                        } else {
                            $("#autoShare").attr('checked', false);
                            clearInterval(shareTimer);
                            shareTimer = null;
                            $("#infos").html("Echec du partage.");
                        }
                    }, 30000);
                }
            } else {
                $("#infos").html("Partage automatique désactivé.");
                 if (shareTimer != null) {
                     clearInterval(shareTimer);
                     shareTimer = null;
                 }
            }
        });
    },
    onDeviceReady: function() {
        app.refreshDeviceList();
        
        var onGPSSuccess = function(position) { };
        var onGPSError = function(error) { };
        navigator.geolocation.getCurrentPosition(onGPSSuccess, onGPSError);
    },
    refreshDeviceList: function() {
        deviceList.innerHTML = ''; // empties the list
        rfduino.discover(5, app.onDiscoverDevice, app.onError);
    },
    onDiscoverDevice: function(device) {
        var listItem = document.createElement('div');
        var html = '<b>' + device.name + '</b><br/>' + 'Numéro de série : ' + device.advertising + '<br/>RSSI : '+ device.rssi;

        listItem.setAttribute('class', "deviceListElt");
        listItem.setAttribute('uuid', device.uuid);
        listItem.setAttribute('serial', device.advertising);
        listItem.innerHTML = html;
        
        deviceList.appendChild(listItem);
    },
    connect: function(e) {
        var uuid = e.target.getAttribute('uuid');
        var _serial = e.target.getAttribute('serial');
        if (uuid==null) {
        	uuid = e.target.parentNode.getAttribute('uuid');
        	_serial = e.target.parentNode.getAttribute('serial');
        }
        
        var onConnect = function() {
            serial = _serial;
            rfduino.onData(app.onData, app.onError);
            app.showDetailPage();
        };

        rfduino.connect(uuid, onConnect, app.onError);
    },
    onData: function(data) {
        console.log(data);
        var dataArray = arrayBufferToFloat(data);
        
        ppmpcfValue = dataArray[0];
        tempValue = dataArray[2];
        humValue = dataArray[1];
        var batValue = BatteryTool.voltageToPcent(dataArray[3]);

        $("#ppmpcf").html((dataToShare.ppmpcf*100).toFixed(2));
        $("#tempCelsius").html(tempValue.toFixed(2));
        $("#hum").html(humValue.toFixed(2));
        $("#batterie").html(batValue.toFixed(2));
        $("#serial").html(serial);
    },
    shareData: function() {
        $("#ajaxLoader").show();
        $("#shareContent").hide();
        $("#infos").html("");
        
        if (ppmpcfValue && tempValue && humValue) {
            dataToShare.ppmpcf = ppmpcfValue;
            dataToShare.temperature = tempValue;
            dataToShare.humidity = humValue;
            dataToShare.serial = serial;
            
            var onGPSSuccess = function(position) {
                dataToShare.latitude = position.coords.latitude;
                dataToShare.longitude = position.coords.longitude;
                if (position.coords.altitude == null) {
                    dataToShare.altitude = 0;
                } else {
                    dataToShare.altitude = position.coords.altitude;
                }
                if (position.timestamp !== undefined) {
                    dataToShare.timestamp = position.timestamp;
                } else {
                    dataToShare.timestamp = new Date().getTime();
                }
                
                var html = "";
                html += "Particules : "+(dataToShare.ppmpcf*100).toFixed(2)+" ppcf<br/>";
                html +=	"Température : "+dataToShare.temperature.toFixed(2)+" &deg;C<br/>";
                html += "Humidité : "+dataToShare.humidity.toFixed(2)+" %<br/>";
                html += "<br/>";
                html += "Latitude : "+dataToShare.latitude.toFixed(3)+"<br/>";
                html += "Longitude : "+dataToShare.longitude.toFixed(3)+"<br/>";
                html += "Altitude : "+dataToShare.altitude.toFixed(3)+"<br/>";
                var d = new Date(dataToShare.timestamp);
                html += "Date : "+d.getDate()+"/"+d.getMonth()+"/"+d.getFullYear()+" "+d.getHours()+":"+d.getMinutes();
                
                $("#shareData").html(html);
                $("#shareContent").show();
                $("#ajaxLoader").hide();
            };
            
            var onGPSError = function(error) {
    			$("#ajaxLoader").hide();
    			$("#infos").html("Impossible de récupérer les coordonnées GPS de l'apareil.");
            };
            
            navigator.geolocation.getCurrentPosition(onGPSSuccess, onGPSError);
        } else {
             $("#ajaxLoader").hide();
             $("#infos").html("Aucune donnée à partager.");
        }
    },
    sendData: function() {
        $("#ajaxLoader").show();
        $.ajax({
            url: "http://pmclab.fr:8043/addAll",
            type: 'PUT',
            data: JSON.stringify(dataToShare),
            contentType: 'application/json',
            success: function(result) {
                $("#ajaxLoader").hide();
                $("#shareContent").hide();
                $("#infos").html("Données partagées. Merci de votre contribution.");
            },
            error: function(xhr, status, error) {
                $("#ajaxLoader").hide();
                $("#infos").html("Une erreur est survenue lors du partage.");
            }
        });
    },
    disconnect: function() {
        rfduino.disconnect(app.showMainPage, app.onError);
        if (shareTimer != null) {
            $("#autoShare").attr('checked', false);
            clearInterval(shareTimer);
            shareTimer = null;
        }
    },
    showMainPage: function() {
        $("#mainPage").show();
        $("#detailPage").hide();
    },
    showDetailPage: function() {
        $("#mainPage").hide();
        $("#detailPage").show();
    },
    onError: function(reason) {
        if (reason.toUpperCase() == "DISCONNECTED") {
            app.disconnect();
        }
        console.log(reason.toUpperCase()); // real apps should use notification.alert
    }
};

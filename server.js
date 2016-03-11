"use strict";

var fs = require("fs");
var Gamedig = require('gamedig');
var express = require('express');
var exphbs  = require('express-handlebars');
var bodyParser = require('body-parser');
var schedule = require('node-schedule');

var port = process.env.PORT || 3500;
var gameServers = [],
	gameServersStatus = [],
	games = [];

var app = express();
var hbs = exphbs.create({
	defaultLayout: 'main',
    helpers: {
        getGameName: function (gameType) {
        	for(var i = 0; i < games.length; i++) {
        		if (games[i].type === gameType) {
        			return games[i].name;
        		}
        	}
        },
        getGamesSelected: function(gameType) {
        	console.log("getGamesSelected", gameType);
        	return games.map(function(game) {
        		game.selected = game.type === gameType;
        		return game;
        	});
        }
    }
});

try {
    gameServers = JSON.parse( fs.readFileSync('servers.json', "UTF-8") );
}
catch (e) {
}

// SETUP EXPRESS

app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 

app.get('/', function (req, res) {
	res.render('home', {
		games: games,
		servers: gameServers,
		serversStatus: gameServersStatus
	});
});

app.post('/', function (req, res) {
	console.log("SERVERS", req.body);

	var servers = [],
		types = req.body.type,
		hosts = req.body.host,
		ports = req.body.port;

	for(var i = 0; i < hosts.length; i++) {
		if (types[i] && hosts[i] && ports[i]) {
			servers.push({
				type: types[i],
				host: hosts[i],
				port: ports[i]
			})
		}
	}

	updateAndSaveGameServers(servers, function(gameServers_) {
		gameServers = gameServers_;
		res.redirect('/');
	});
});

// FUNCTIONS

function queryGameServerPromise(type, host, port) {
	return new Promise(function(fulfill) {
		try {
			Gamedig.query({
			       	type: type,
			        host: host,
			        port: parseInt(port)
			    },
			    function(state) {
			        if(state.error) {
			        	console.error(state.error);
			        	fulfill(null);
			        }
			        else {
			        	fulfill(state);
			        }
			    }
			);
		}
		catch(e) {
			console.error(e);
			fulfill(null);
		}
	});	
}

function updateAndSaveGameServers(gameServers, callback) {
	updateGameServers(gameServers, function(){
		fs.writeFile("servers.json", JSON.stringify( gameServers ), function() {
			callback(gameServers);
		});
	});
}

function updateGameServers(gameServers, callback) {
	console.log("Update game servers", gameServers);
	Promise.all(gameServers.map(function(gameServer) {
		return queryGameServerPromise(gameServer.type, gameServer.host, gameServer.port);
	})).then(function(gameServerQueries) {		
		gameServersStatus = gameServerQueries.filter(function(gameServerQuery) {
			return !!gameServerQuery;
		});

		console.log("Game servers status", gameServersStatus);

		if (callback) {
			callback(gameServersStatus);
		}
	});
}

function getGames() {
	var gamesRaw = fs.readFileSync('node_modules/gamedig/games.txt', "UTF-8");

	return gamesRaw.split("\n").map(function(gameLine) {
		var match = gameLine.match(/^(\w+)\|(.*?)\|/);

		if (match) {
			return {
				type: match[1],
				name: match[2]
			};
		}
		return null;
	}).filter(function(game) {
		return !!game;
	});
}

// READY

games = getGames();

app.listen(port, function () {
	console.log('Example app listening on port ' + port + '!');
});

schedule.scheduleJob("*/5 * * * *", function() {
	updateGameServers(gameServers);
});

updateGameServers(gameServers);
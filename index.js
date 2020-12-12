// import dns from 'dns';

import consul from 'consul';
import { Mutex as asyncMutex } from 'async-mutex';

import LibraryUtility from '@thzero/library_common/utility';

import ResourceDiscoveryService from '@thzero/library_server/service/discovery/resources';

class ConsulResourceDiscoveryService extends ResourceDiscoveryService {
	constructor() {
		super();

		this._mutex = new asyncMutex();

		this._address = null;
		this._consul = null;
		this._name = null;

		this._services = new Map();
	}

	async cleanup() {
		if (!this._consul)
			return;
		if (String.isNullOrEmpty(this._name))
			return;

		this._consul.agent.service.deregister(this._name, function(err) {
			if (err)
				throw err;
		});
	}

	async _getService(correlationId, name) {
		try {
			let service = this._services.get(name);
			if (service)
				return this._successResponse(service, correlationId);

			const release = await this._mutex.acquire();
			try {
				let service = this._services.get(name);
				if (service)
					return this._successResponse(service, correlationId);

				let results = await this._consul.agent.service.list();
				if (!results || (results.length === 0))
					return this._error('ConsulServiceDiscoveryService', '_get', `Invalid results from discovery server for '${name}'.`, null, null, null, correlationId);

				results = results[name];
				if (results === null)
					return this._error('', '', `Invalid service for '${name}'.`, null, null, null, correlationId);

				if (results.Meta)
					results.secure = results.Meta.secure;

				if (results.grpc) {
					results.grpc = {
						port: results.grpc,
						tls: results.grpcusetls
					}
				}

				this._services.set(name, results);

				return this._successResponse(results, correlationId);
			}
			finally {
				release();
			}
			// const results = await new Promise((resolve, reject) => {
			// 	dns.resolve(name + 'service.consul', function(err, records) {
			// 		this._logger.debug2('\nDNS query', null, correlationId);
			// 		if (err) {
			// 			reject(err);
			// 			return;
			// 		}

			// 		this._logger.debug2('\nDNS query', records, correlationId);
			// 		if (!records || (records.length > 0)) {
			// 			reject(Error(`No DNS found for '${name}'.`));
			// 			return;
			// 		}

			// 		resolve(records[0]);
			// 	});

			// 	// dns.resolveAny(name + 'service.consul', function(err, records) {
			// 	// 	this._logger.debug2('\nDNS ANY query', null, correlationId);
			// 	// 	if (err) {
			// 	// 		reject(err);
			// 	// 		return;
			// 	// 	}

			// 	// 	this._logger.debug2('\nDNS ANY query', records, correlationId);
			// 	// 	if (!records || (records.length > 0)) {
			// 	// 		reject(Error(`No DNS ANY found for '${name}'.`));
			// 	// 		return;
			// 	// 	}

			// 	// 	resolve(records[0]);
			// 	// });
			// });

			// return this._successResponse(results, correlationId);
		}
		catch (err) {
			return this._error('ConsulServiceDiscoveryService', '_get', null, err, null, null, correlationId);
		}
	}

	async _initialize(correlationId, opts) {
		const packagePath = `${process.cwd()}/package.json`;
		const packageJson = require(packagePath);

		this._address = opts.address;

		try {
			// dns.setServers([ this._address + ':8600' ]); // query against the consul agent
			//console.log(dns.getServers());

			this._consul = consul({
				host: this._address,
				promisify: true
			});

			const config = {
				id: LibraryUtility.generateId(),
				name: packageJson.name + '_instance',
				address: this._address,
				port: opts.port,
				meta: {
					secure: `${opts.secure}`,
					grpcPort: `${opts.grpc.port}`,
					grpcSecure: `${opts.grpc.secure}`
				},
				check: {
					http: `http${opts.secure ? 's' : ''}://${opts.address}:${opts.port}/${opts.healthCheck}`,
					interval: opts.interval ? opts.interval : '5s',
					timeout: opts.timeout ? opts.timeout : '1s',
					deregistercriticalserviceafter: '30s'
				}
			};
			if (opts) {
				if (!String.isNullOrEmpty(opts.name))
					config.name = opts.name;
				if (!String.isNullOrEmpty(opts.description))
					config.notes = opts.description;
				if (!String.isNullOrEmpty(opts.name))
					config.name = opts.name;
				if (!String.isNullOrEmpty(opts.interval))
					config.interval = opts.interval;
				if (!String.isNullOrEmpty(opts.timeout))
					config.timeout = opts.timeout;
				if (!String.isNullOrEmpty(opts.deregistercriticalserviceafter))
					config.deregistercriticalserviceafter = opts.deregistercriticalserviceafter;
			}

			await this._consul.agent.service.register(config);
			return this._success(correlationId);
		}
		catch (err) {
			return this._error('ConsulServiceDiscoveryService', '_initialize', null, err, null, null, correlationId);
		}
	}

	async _register(correlationId, opts) {
		const packagePath = `${process.cwd()}/package.json`;
		const packageJson = require(packagePath);

		this._address = opts.address;

		// dns.setServers([ this._address + ':8600' ]); // query against the consul agent
		//console.log(dns.getServers());

		this._consul = consul({
			host: this._address,
			promisify: true
		});

		const config = {
			id: LibraryUtility.generateId(),
			name: packageJson.name + '_instance',
			ttl: '10s',
			address: this._address,
			port: opts.port
		};
		if (!String.isNullOrEmpty(opts.name))
			config.name = opts.name;
		if (!String.isNullOrEmpty(opts.ttl))
			config.ttl = opts.ttl;
		if (!String.isNullOrEmpty(opts.description))
			config.notes = opts.description;
		if (opts.grpc && opts.grpc.port) {
			config.grpc = `${opts.address}:${opts.grpc.port}`;
			if (options.grpc.tls)
				config.grpcusetls = options.grpc.tls;
		}

		await this._consul.agent.service.register(config);
		return this._success(correlationId);
	}

	async _listing(correlationId) {
		let result = await this._consul.agent.service.list();
		// TODO: need to convert to a common output format
		return this._successResponse(result, correlationId);
	}
}

export default ConsulResourceDiscoveryService;

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
			if (!service)
				return this._successResponse(service, correlationId);

			const release = await this._mutex.acquire();
			try {
				let service = this._services.get(name);
				if (!service)
					return this._successResponse(service, correlationId);

				let results = await this._consul.agent.service.list();

				this._services.set(name, service);
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

			return this._successResponse(results, correlationId);
		}
		catch (err) {
			return this._error('ConsulServiceDiscoveryService', '_get', null, err, null, null, correlationId);
		}
	}

	async _initialize(correlationId, address, port, opts) {
		const packagePath = `${process.cwd()}/package.json`;
		const packageJson = require(packagePath);

		this._address = address;

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
				ttl: '10s',
				address: this._address,
				port: port
			};
			if (opts) {
				if (!String.isNullOrEmpty(opts.name))
					config.name = opts.name;
				if (!String.isNullOrEmpty(opts.ttl))
					config.ttl = opts.ttl;
				if (!String.isNullOrEmpty(opts.description))
					config.notes = opts.description;
			}

			await this._consul.agent.service.register(config);
			return this._success(correlationId);
		}
		catch (err) {
			return this._error('ConsulServiceDiscoveryService', '_initialize', null, err, null, null, correlationId);
		}
	}

	async _listing(correlationId) {
		let result = await this._consul.agent.service.list();
		// TODO: need to convert to a common output format
		return this._successResponse(result, correlationId);
	}
}

export default ConsulResourceDiscoveryService;
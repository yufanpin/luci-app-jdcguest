'use strict';
'require view';
'require rpc';
'require ui';
'require uci';
'require form';

var callStatus = rpc.declare({
	object: 'jdcguest',
	method: 'status',
	params: []
});

var callApply = rpc.declare({
	object: 'jdcguest',
	method: 'apply',
	params: [
		'ssid_2g', 'ssid_5g', 'key', 'subnet',
		'isolate_2g', 'isolate_5g', 'dhcp_start', 'dhcp_limit'
	]
});

var callRemove = rpc.declare({
	object: 'jdcguest',
	method: 'remove',
	params: []
});

/*
 * The UCI section is declared as `config network 'jdcguest'` in
 * /etc/config/jdcguest, so the LuCI Section below binds to it by type while
 * this constant names it unambiguously for reads and writes.
 */
var SID = 'jdcguest';

function validateKey(_, value) {
	var key = value.trim();

	// Blank is not an error: it means "keep the passphrase already in effect".
	if (!key)
		return true;

	if (key.length < 8 || key.length > 63)
		return _('The passphrase must be between 8 and 63 characters.');

	return true;
}

function validateSsid(required) {
	return function(_, value) {
		var ssid = value.trim();

		if (ssid.length > 32)
			return _('The SSID may not exceed 32 characters.');

		if (required && !ssid)
			return _('A 2.4 GHz SSID is required.');

		return true;
	};
}

function validateSubnet(_, value) {
	var subnet = value.trim();

	if (subnet === '' || subnet === 'auto')
		return true;

	if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(subnet))
		return _('Use CIDR notation, for example 192.168.50.1/24.');

	return true;
}

function validateNumber(minimum, maximum) {
	return function(_, value) {
		var number = parseInt(value, 10);

		if (isNaN(number) || number < minimum || number > maximum)
			return _('Enter a number between %d and %d.').format(minimum, maximum);

		return true;
	};
}

function bandLabel(band) {
	if (band === '2g')
		return _('2.4 GHz');

	if (band === '5g')
		return _('5 GHz');

	return band || '-';
}

function renderRadioTable(status) {
	var rows = [E('tr', {}, [
		E('th', {}, _('Radio')),
		E('th', {}, _('Band')),
		E('th', {}, _('Channel')),
		E('th', {}, _('DFS')),
		E('th', {}, _('Path'))
	])];

	status.radios.forEach(function(radio) {
		rows.push(E('tr', {}, [
			E('td', {}, [radio.section]),
			E('td', {}, [bandLabel(radio.band)]),
			E('td', {}, [radio.channel]),
			E('td', {}, [radio.dfs ? _('yes') : _('no')]),
			E('td', {}, [radio.path || '-'])
		]));
	});

	return E('table', { 'class': 'table' }, rows);
}

function collectNotices(status) {
	var notices = [];

	if (status.nonwildcard === '1' && !status.dnsmasq_registered)
		notices.push(_('dnsmasq runs with nonwildcard=1 and the guest interface is not a listening interface. Applying registers it, otherwise no guest would ever receive a lease.'));

	if (status.recommend.band_5g && status.recommend.band_5g_state !== 'ok')
		notices.push(_('The only 5 GHz radio sits on a DFS channel. The 5 GHz guest SSID is skipped so it does not disappear during radar detection.'));

	if (status.warnings)
		notices.push(status.warnings);

	return notices;
}

function renderStatus(status, removeButton) {
	var facts = [
		E('li', {}, [E('strong', {}, _('Board')), ' ' + (status.board || '?')]),
		E('li', {}, [E('strong', {}, _('Model')), ' ' + (status.model || '?')]),
		E('li', {}, [
			E('strong', {}, _('Selected radios')),
			' ' + _('2.4 GHz') + ': ' + (status.recommend.band_2g || '-') +
			', ' + _('5 GHz') + ': ' + (status.recommend.band_5g || '-')
		]),
		E('li', {}, [
			E('strong', {}, _('Guest network')),
			' ' + (status.guest_enabled ? _('enabled') : _('not configured'))
		]),
		E('li', {}, [
			E('strong', {}, _('dnsmasq nonwildcard')),
			' ' + (status.nonwildcard === '1'
				? (status.dnsmasq_registered ? _('on, guest registered') : _('on, guest not registered'))
				: _('off'))
		])
	];

	var children = [
		E('h3', {}, _('Detected hardware')),
		renderRadioTable(status),
		E('h3', {}, _('Current state')),
		E('ul', { 'class': 'jdcguest-facts' }, facts)
	];

	var notices = collectNotices(status);

	if (notices.length) {
		children.push(E('div', { 'class': 'alert alert-warning' }, [
			E('h4', {}, _('Attention')),
			E('ul', {}, notices.map(function(notice) {
				return E('li', {}, notice);
			}))
		]));
	}

	if (removeButton)
		children.push(removeButton);

	return E('div', { 'class': 'cbi-section' }, children);
}

return view.extend({
	handleSaveApply: function() {
		var previousKey = uci.get('jdcguest', SID, 'key') || '';

		return this.map.saveAll().then(function() {
			var enabled = uci.get('jdcguest', SID, 'enabled');

			/*
			 * A blank passphrase must not overwrite the stored one, otherwise
			 * clearing the field to change only the SSID would silently drop the
			 * key from /etc/config/jdcguest.
			 */
			var key = uci.get('jdcguest', SID, 'key') || '';

			if (!key) {
				key = previousKey;
				uci.set('jdcguest', SID, 'key', key);
			}

			if (enabled !== '1')
				return uci.save().then(function() { return callRemove(); });

			return uci.save().then(function() {
				return callApply(
					uci.get('jdcguest', SID, 'ssid_2g'),
					uci.get('jdcguest', SID, 'ssid_5g'),
					key,
					uci.get('jdcguest', SID, 'subnet') || 'auto',
					uci.get('jdcguest', SID, 'isolate_2g') === '1' ? '1' : '0',
					uci.get('jdcguest', SID, 'isolate_5g') === '1' ? '1' : '0',
					uci.get('jdcguest', SID, 'dhcp_start') || '100',
					uci.get('jdcguest', SID, 'dhcp_limit') || '50'
				);
			}).then(function(result) {
				ui.addNotification(null, E('p', [
					E('strong', {}, _('Guest network applied.')), ' ',
					result.notes || '', ' ',
					E('span', {}, _('Subnet %s, 2.4 GHz on %s, 5 GHz on %s.')
						.format(result.subnet, result.radio_2g, result.radio_5g || '-'))
				]), 'info');

				location.reload();
			});
		}).catch(function(error) {
			ui.addNotification(null, E('p', [
				E('strong', {}, _('Applying the guest network failed.')), ' ',
				error.message || error
			]), 'danger');
		});
	},

	handleRemove: function() {
		return callRemove().then(function() {
			ui.addNotification(null, E('p', [_('Guest network removed.')]), 'info');
			location.reload();
		}).catch(function(error) {
			ui.addNotification(null, E('p', [
				E('strong', {}, _('Removing the guest network failed.')), ' ',
				error.message || error
			]), 'danger');
		});
	},

	handleSave: function() {
		return this.map.saveAll();
	},

	handleReset: function() {
		this.map.resetAll();
	},

	handleSaveApplyCompat: function() {
		return this.handleSaveApply();
	},

	render: function(data) {
		var self = this;
		var status = data[0] || {};

		if (!status.model) {
			status = {
				board: '?', model: '?', radios: [],
				recommend: { band_2g: '', band_5g: '', band_5g_state: 'ok' },
				nonwildcard: '', dnsmasq_registered: true,
				guest_enabled: false, guest: {}, warnings: ''
			};
		}

		var map = new form.Map('jdcguest', _('Guest network'),
			_('An isolated wireless network for guests. The guest zone is denied access to the LAN and reaches the internet through NAT.'));

		var section = new form.Section(map, 'network', _('Settings'));
		section.addremove = false;

		var option;

		option = section.option(form.Flag, 'enabled', _('Enable'),
			_('Clearing this removes the guest network on apply.'));
		option.rmempty = false;

		option = section.option(form.Value, 'ssid_2g', _('2.4 GHz SSID'),
			_('Served by %s.').format(status.recommend.band_2g || 'radio1'));
		option.placeholder = status.guest.ssid_2g || 'Superman-Guest';
		option.validate = validateSsid(true);
		option.depends('uci', 'jdcguest', 'enabled', '1');

		option = section.option(form.Value, 'ssid_5g', _('5 GHz SSID'),
			_('Served by %s.').format(status.recommend.band_5g || 'radio2'));
		option.placeholder = status.guest.ssid_5g || 'Superman-Guest';
		option.validate = validateSsid(false);
		option.depends('uci', 'jdcguest', 'enabled', '1');

		option = section.option(form.Value, 'key', _('Passphrase'),
			_('WPA2-PSK, 8 to 63 characters. Leave blank to keep the current passphrase.'));
		option.password = true;
		option.optional = true;
		option.validate = validateKey;
		option.depends('uci', 'jdcguest', 'enabled', '1');

		option = section.option(form.Value, 'subnet', _('Guest subnet'),
			_('Leave on automatic to pick a range that does not clash with the LAN or WAN.'));
		option.placeholder = status.guest.subnet || '192.168.50.1/24';
		option.defaultValue = 'auto';
		option.validate = validateSubnet;
		option.depends('uci', 'jdcguest', 'enabled', '1');

		option = section.option(form.Value, 'dhcp_start', _('First address'),
			_('Offset from the guest subnet.'));
		option.defaultValue = '100';
		option.datatype = 'uinteger';
		option.validate = validateNumber(1, 250);
		option.depends('uci', 'jdcguest', 'enabled', '1');

		option = section.option(form.Value, 'dhcp_limit', _('Address pool size'),
			_('Number of addresses handed out to guests.'));
		option.defaultValue = '50';
		option.datatype = 'uinteger';
		option.validate = validateNumber(2, 250);
		option.depends('uci', 'jdcguest', 'enabled', '1');

		option = section.option(form.Flag, 'isolate_2g', _('Isolate 2.4 GHz clients'),
			_('Blocks traffic between guests on the 2.4 GHz SSID.'));
		option.default = '1';
		option.rmempty = false;
		option.depends('uci', 'jdcguest', 'enabled', '1');

		option = section.option(form.Flag, 'isolate_5g', _('Isolate 5 GHz clients'),
			_('Blocks traffic between guests on the 5 GHz SSID.'));
		option.default = '1';
		option.rmempty = false;
		option.depends('uci', 'jdcguest', 'enabled', '1');

		var removeButton = status.guest_enabled ? E('button', {
			'class': 'cbi-button cbi-button-remove',
			'click': ui.createHandlerFn(this, 'handleRemove')
		}, [_('Remove guest network')]) : null;

		return E('div', { 'class': 'cbi-map' }, [
			renderStatus(status, removeButton),
			map.render()
		]);
	}
});

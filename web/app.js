const API_BASE = '/api';
const initialResetMatch = window.location.hash.match(/^#reset-password\/([A-Za-z0-9_-]{40,128})$/);
let activePasswordResetToken = initialResetMatch?.[1] || '';

if (window.location.search || initialResetMatch) window.history.replaceState(null, '', window.location.pathname);

const loginScreen = document.querySelector('#login-screen');
const loginMode = document.querySelector('#login-mode');
const loginForm = document.querySelector('#login-form');
const loginButton = document.querySelector('#login-button');
const loginError = document.querySelector('#login-error');
const toggleLoginPasswordButton = document.querySelector('#toggle-login-password');
const forgotPasswordButton = document.querySelector('#forgot-password');
const passwordRecoveryMode = document.querySelector('#password-recovery-mode');
const passwordRecoveryForm = document.querySelector('#password-recovery-form');
const passwordRecoveryButton = document.querySelector('#password-recovery-button');
const passwordRecoveryFeedback = document.querySelector('#password-recovery-feedback');
const backToLoginButton = document.querySelector('#back-to-login');
const passwordResetMode = document.querySelector('#password-reset-mode');
const passwordResetForm = document.querySelector('#password-reset-form');
const passwordResetButton = document.querySelector('#password-reset-button');
const passwordResetFeedback = document.querySelector('#password-reset-feedback');
const appShell = document.querySelector('#app-shell');
const logoutButton = document.querySelector('#logout-button');
const accountName = document.querySelector('#account-name');
const accountTenant = document.querySelector('#account-tenant');
const accountAvatar = document.querySelector('#account-avatar');
const applicationVersion = document.querySelector('#application-version');
const form = document.querySelector('#search-form');
const eventAtInput = document.querySelector('#event-at');
const queryTimezone = document.querySelector('#query-timezone');
const queryTimezoneHint = document.querySelector('#query-timezone-hint');
const searchButton = document.querySelector('#search-button');
const resultTitle = document.querySelector('#result-title');
const auditLine = document.querySelector('#audit-line');
const emptyState = document.querySelector('#empty-state');
const errorState = document.querySelector('#error-state');
const errorMessage = document.querySelector('#error-message');
const tableWrap = document.querySelector('#table-wrap');
const resultBody = document.querySelector('#result-body');
const broadNotice = document.querySelector('#broad-notice');
const exportButtons = [...document.querySelectorAll('[data-export]')];
const menuButton = document.querySelector('#menu-button');
const navLinks = [...document.querySelectorAll('[data-view]')];
const overviewNavTitle = document.querySelector('#nav-overview-title');
const queryNav = document.querySelector('#query-nav');
const operationNavGroup = document.querySelector('#operation-nav-group');
const platformOperationNavGroup = document.querySelector('#platform-operation-nav-group');
const infrastructureNavGroup = document.querySelector('#infrastructure-nav-group');
const platformInfrastructureNavGroup = document.querySelector('#platform-infrastructure-nav-group');
const administrationNavGroup = document.querySelector('#administration-nav-group');
const platformDashboardView = document.querySelector('#platform-dashboard-view');
const platformAuditView = document.querySelector('#platform-audit-view');
const dashboardView = document.querySelector('#dashboard-view');
const queryView = document.querySelector('#query-view');
const devicesView = document.querySelector('#devices-view');
const collectorsView = document.querySelector('#collectors-view');
const firewallView = document.querySelector('#firewall-view');
const systemView = document.querySelector('#system-view');
const alertsView = document.querySelector('#alerts-view');
const serversView = document.querySelector('#servers-view');
const continuityView = document.querySelector('#continuity-view');
const capacityView = document.querySelector('#capacity-view');
const capacityIntroCopy = document.querySelector('#capacity-intro-copy');
const clientsView = document.querySelector('#clients-view');
const plansView = document.querySelector('#plans-view');
const platformSettingsView = document.querySelector('#platform-settings-view');
const platformManualView = document.querySelector('#platform-manual-view');
const usersView = document.querySelector('#users-view');
const auditView = document.querySelector('#audit-view');
const integrationsView = document.querySelector('#integrations-view');
const pageEyebrow = document.querySelector('#page-eyebrow');
const pageTitle = document.querySelector('#page-title');
const tenantContext = document.querySelector('#tenant-context');
const tenantContextName = document.querySelector('#tenant-context-name');
const returnPlatformButton = document.querySelector('#return-platform');
const environmentLabel = document.querySelector('#environment-label');
const refreshPlatformDashboardButton = document.querySelector('#refresh-platform-dashboard');
const platformDashboardPeriod = document.querySelector('#platform-dashboard-period');
const platformDashboardActiveClients = document.querySelector('#platform-dashboard-active-clients');
const platformDashboardClientTotal = document.querySelector('#platform-dashboard-client-total');
const platformDashboardCollectors = document.querySelector('#platform-dashboard-collectors');
const platformDashboardCollectorsDetail = document.querySelector('#platform-dashboard-collectors-detail');
const platformDashboardDevices = document.querySelector('#platform-dashboard-devices');
const platformDashboardDevicesDetail = document.querySelector('#platform-dashboard-devices-detail');
const platformDashboardAlerts = document.querySelector('#platform-dashboard-alerts');
const platformDashboardAlertsDetail = document.querySelector('#platform-dashboard-alerts-detail');
const platformDashboardGeneratedAt = document.querySelector('#platform-dashboard-generated-at');
const platformDashboardRawRecords = document.querySelector('#platform-dashboard-raw-records');
const platformDashboardEvents = document.querySelector('#platform-dashboard-events');
const platformDashboardRate = document.querySelector('#platform-dashboard-rate');
const platformDashboardLastLog = document.querySelector('#platform-dashboard-last-log');
const platformDashboardParseFailures = document.querySelector('#platform-dashboard-parse-failures');
const platformDashboardQueue = document.querySelector('#platform-dashboard-queue');
const platformDashboardServerStatus = document.querySelector('#platform-dashboard-server-status');
const platformDashboardCpu = document.querySelector('#platform-dashboard-cpu');
const platformDashboardCpuBar = document.querySelector('#platform-dashboard-cpu-bar');
const platformDashboardMemory = document.querySelector('#platform-dashboard-memory');
const platformDashboardMemoryBar = document.querySelector('#platform-dashboard-memory-bar');
const platformDashboardStoragePercent = document.querySelector('#platform-dashboard-storage-percent');
const platformDashboardStorageBar = document.querySelector('#platform-dashboard-storage-bar');
const platformDashboardStorage = document.querySelector('#platform-dashboard-storage');
const platformDashboardBackup = document.querySelector('#platform-dashboard-backup');
const platformDashboardVolumeChart = document.querySelector('#platform-dashboard-volume-chart');
const platformDashboardStorageList = document.querySelector('#platform-dashboard-storage-list');
const platformDashboardAttentionList = document.querySelector('#platform-dashboard-attention-list');
const platformDashboardOpenAlerts = document.querySelector('#platform-dashboard-open-alerts');
const platformDashboardLoading = document.querySelector('#platform-dashboard-loading');
const platformDashboardError = document.querySelector('#platform-dashboard-error');
const platformDashboardErrorMessage = document.querySelector('#platform-dashboard-error-message');
const integrationsNav = document.querySelector('#integrations-nav');
const erpQueryOption = document.querySelector('#erp-query-option');
const platformIntegrationsNav = document.querySelector('#platform-integrations-nav');
const platformIntegrationsContent = document.querySelector('#platform-integrations-content');
const tenantIntegrationsContent = document.querySelector('#tenant-integrations-content');
const platformIntegrationsUpdated = document.querySelector('#platform-integrations-updated');
const platformIntegrationsLoading = document.querySelector('#platform-integrations-loading');
const platformIntegrationsError = document.querySelector('#platform-integrations-error');
const platformIntegrationsErrorMessage = document.querySelector('#platform-integrations-error-message');
const platformIntegrationCatalog = document.querySelector('#platform-integration-catalog');
const platformEllevenConfigured = document.querySelector('#platform-elleven-configured');
const platformEllevenActive = document.querySelector('#platform-elleven-active');
const platformEllevenEnabled = document.querySelector('#platform-elleven-enabled');
const platformEllevenActionLabel = document.querySelector('#platform-elleven-action-label');
const platformEllevenFeedback = document.querySelector('#platform-elleven-feedback');
const integrationTarget = document.querySelector('#integration-target');
const integrationTenant = document.querySelector('#integration-tenant');
const integrationStatePill = document.querySelector('#integration-state-pill');
const integrationLastUpdate = document.querySelector('#integration-last-update');
const integrationRadiusCheck = document.querySelector('#integration-radius-check');
const integrationVoalleDatabaseCheck = document.querySelector('#integration-voalle-database-check');
const integrationsEmpty = document.querySelector('#integrations-empty');
const integrationList = document.querySelector('#integration-list');
const addIntegrationButton = document.querySelector('#add-integration');
const addFirstIntegrationButton = document.querySelector('#add-first-integration');
const editIntegrationButton = document.querySelector('#edit-integration');
const deleteIntegrationButton = document.querySelector('#delete-integration');
const integrationCatalogDialog = document.querySelector('#integration-catalog-dialog');
const closeIntegrationCatalogButton = document.querySelector('#close-integration-catalog');
const selectEllevenIntegrationButton = document.querySelector('#select-elleven-integration');
const integrationWizardDialog = document.querySelector('#integration-wizard-dialog');
const closeIntegrationWizardButton = document.querySelector('#close-integration-wizard');
const integrationWizardMode = document.querySelector('#integration-wizard-mode');
const integrationWizardSteps = [...document.querySelectorAll('[data-integration-step]')];
const integrationWizardIndicators = [...document.querySelectorAll('[data-integration-step-indicator]')];
const integrationWizardBackButton = document.querySelector('#integration-wizard-back');
const integrationWizardNextButton = document.querySelector('#integration-wizard-next');
const integrationReviewRadius = document.querySelector('#integration-review-radius');
const integrationReviewRadiusDetail = document.querySelector('#integration-review-radius-detail');
const integrationReviewVoalleDatabase = document.querySelector('#integration-review-voalle-database');
const integrationReviewVoalleDatabaseDetail = document.querySelector('#integration-review-voalle-database-detail');
const deleteIntegrationDialog = document.querySelector('#delete-integration-dialog');
const deleteIntegrationForm = document.querySelector('#delete-integration-form');
const closeDeleteIntegrationButton = document.querySelector('#close-delete-integration');
const confirmDeleteIntegrationButton = document.querySelector('#confirm-delete-integration');
const deleteIntegrationFeedback = document.querySelector('#delete-integration-feedback');
const integrationsLoading = document.querySelector('#integrations-loading');
const integrationsError = document.querySelector('#integrations-error');
const integrationsErrorMessage = document.querySelector('#integrations-error-message');
const ellevenIntegrationForm = document.querySelector('#elleven-integration-form');
const radiusTestState = document.querySelector('#radius-test-state');
const voalleDatabaseTestState = document.querySelector('#voalle-database-test-state');
const radiusDiscovery = document.querySelector('#radius-discovery');
const radiusCandidates = document.querySelector('#radius-candidates');
const voalleDatabaseDiscovery = document.querySelector('#voalle-database-discovery');
const voalleDatabaseCandidates = document.querySelector('#voalle-database-candidates');
const radiusTestFeedback = document.querySelector('#radius-test-feedback');
const voalleDatabaseTestFeedback = document.querySelector('#voalle-database-test-feedback');
const integrationSaveFeedback = document.querySelector('#integration-save-feedback');
const testRadiusButton = document.querySelector('#test-radius');
const testVoalleDatabaseButton = document.querySelector('#test-voalle-database');
const saveIntegrationButton = document.querySelector('#save-integration');
const refreshDevicesButton = document.querySelector('#refresh-devices');
const devicesLoading = document.querySelector('#devices-loading');
const devicesError = document.querySelector('#devices-error');
const devicesErrorMessage = document.querySelector('#devices-error-message');
const deviceList = document.querySelector('#device-list');
const devicesGeneratedAt = document.querySelector('#devices-generated-at');
const deviceTotal = document.querySelector('#device-total');
const deviceTotalDetail = document.querySelector('#device-total-detail');
const deviceReceiving = document.querySelector('#device-receiving');
const deviceAttention = document.querySelector('#device-attention');
const devicePlanLabel = document.querySelector('#device-plan-label');
const devicePlan = document.querySelector('#device-plan');
const devicePlanUsage = document.querySelector('#device-plan-usage');
const devicesViewTitle = document.querySelector('#devices-view-title');
const devicesViewCopy = document.querySelector('#devices-view-copy');
const refreshCollectorsButton = document.querySelector('#refresh-collectors');
const collectorsLoading = document.querySelector('#collectors-loading');
const collectorsError = document.querySelector('#collectors-error');
const collectorsErrorMessage = document.querySelector('#collectors-error-message');
const collectorList = document.querySelector('#collector-list');
const collectorsGeneratedAt = document.querySelector('#collectors-generated-at');
const collectorTotal = document.querySelector('#collector-total');
const collectorTotalDetail = document.querySelector('#collector-total-detail');
const collectorConnected = document.querySelector('#collector-connected');
const collectorPending = document.querySelector('#collector-pending');
const collectorSpool = document.querySelector('#collector-spool');
const collectorsViewTitle = document.querySelector('#collectors-view-title');
const collectorsViewCopy = document.querySelector('#collectors-view-copy');
const refreshSystemButton = document.querySelector('#refresh-system');
const systemServiceTotal = document.querySelector('#system-service-total');
const systemServiceRunning = document.querySelector('#system-service-running');
const systemServiceAttention = document.querySelector('#system-service-attention');
const systemLastBackup = document.querySelector('#system-last-backup');
const systemBackupDetail = document.querySelector('#system-backup-detail');
const systemGeneratedAt = document.querySelector('#system-generated-at');
const systemLoading = document.querySelector('#system-loading');
const systemError = document.querySelector('#system-error');
const systemErrorMessage = document.querySelector('#system-error-message');
const systemServiceList = document.querySelector('#system-service-list');
const refreshAlertsButton = document.querySelector('#refresh-alerts');
const alertsOverall = document.querySelector('#alerts-overall');
const alertsCritical = document.querySelector('#alerts-critical');
const alertsWarning = document.querySelector('#alerts-warning');
const alertsTotal = document.querySelector('#alerts-total');
const alertsGeneratedAt = document.querySelector('#alerts-generated-at');
const alertsLoading = document.querySelector('#alerts-loading');
const alertsError = document.querySelector('#alerts-error');
const alertsErrorMessage = document.querySelector('#alerts-error-message');
const alertsOk = document.querySelector('#alerts-ok');
const alertsWrap = document.querySelector('#alerts-wrap');
const alertsBody = document.querySelector('#alerts-body');
const alertsTenantHeading = document.querySelector('#alerts-tenant-heading');
const alertInvestigationDialog = document.querySelector('#alert-investigation-dialog');
const closeAlertInvestigationButton = document.querySelector('#close-alert-investigation');
const alertInvestigationTitle = document.querySelector('#alert-investigation-title');
const alertInvestigationGenerated = document.querySelector('#alert-investigation-generated');
const alertInvestigationLoading = document.querySelector('#alert-investigation-loading');
const alertInvestigationError = document.querySelector('#alert-investigation-error');
const alertInvestigationErrorMessage = document.querySelector('#alert-investigation-error-message');
const alertInvestigationResult = document.querySelector('#alert-investigation-result');
const alertInvestigationSeverity = document.querySelector('#alert-investigation-severity');
const alertInvestigationHeading = document.querySelector('#alert-investigation-heading');
const alertInvestigationExplanation = document.querySelector('#alert-investigation-explanation');
const alertInvestigationContext = document.querySelector('#alert-investigation-context');
const alertInvestigationActions = document.querySelector('#alert-investigation-actions');
const alertInvestigationEvidenceSection = document.querySelector('#alert-investigation-evidence-section');
const alertInvestigationEvidence = document.querySelector('#alert-investigation-evidence');
const alertInvestigationEmpty = document.querySelector('#alert-investigation-empty');
const alertSettingsPanel = document.querySelector('#alert-settings-panel');
const alertSettingsDialog = document.querySelector('#alert-settings-dialog');
const alertSettingsForm = document.querySelector('#alert-settings-form');
const alertSettingsUpdated = document.querySelector('#alert-settings-updated');
const alertSettingsFeedback = document.querySelector('#alert-settings-feedback');
const alertTestFeedback = document.querySelector('#alert-test-feedback');
const saveAlertSettingsButton = document.querySelector('#save-alert-settings');
const configureAlertsButton = document.querySelector('#configure-alerts');
const alertSettingsList = document.querySelector('#alert-settings-list');
const alertSettingsEmpty = document.querySelector('#alert-settings-empty');
const alertWizardTitle = document.querySelector('#alert-wizard-title');
const closeAlertWizardButton = document.querySelector('#close-alert-wizard');
const alertWizardBackButton = document.querySelector('#alert-wizard-back');
const alertWizardNextButton = document.querySelector('#alert-wizard-next');
const alertWizardSteps = [...document.querySelectorAll('[data-alert-step]')];
const alertWizardIndicators = [...document.querySelectorAll('[data-alert-step-indicator]')];
const alertDestinationInputs = [...document.querySelectorAll('input[name="destinationType"]')];
const alertMasterState = document.querySelector('#alert-master-state');
const alertCredential = document.querySelector('#alert-credential');
const alertCredentialLabel = document.querySelector('#alert-credential-label');
const alertCredentialHelp = document.querySelector('#alert-credential-help');
const alertTelegramChatField = document.querySelector('#alert-telegram-chat-field');
const alertReviewChannel = document.querySelector('#alert-review-channel');
const alertReviewDestination = document.querySelector('#alert-review-destination');
const alertReviewPolicy = document.querySelector('#alert-review-policy');
const alertReviewRecovery = document.querySelector('#alert-review-recovery');
const alertReviewSources = document.querySelector('#alert-review-sources');
const backupPolicy = document.querySelector('#backup-policy');
const backupRemote = document.querySelector('#backup-remote');
const backupTableWrap = document.querySelector('#backup-table-wrap');
const backupBody = document.querySelector('#backup-body');
const backupEmpty = document.querySelector('#backup-empty');
const platformBackupDestinationPanel = document.querySelector('#platform-backup-destination');
const platformBackupDestinationForm = document.querySelector('#platform-backup-destination-form');
const platformBackupDestinationStatus = document.querySelector('#platform-backup-destination-status');
const platformBackupDestinationFeedback = document.querySelector('#platform-backup-destination-feedback');
const backupDriveFolderId = document.querySelector('#backup-drive-folder-id');
const backupDriveRetention = document.querySelector('#backup-drive-retention');
const backupDriveCredentials = document.querySelector('#backup-drive-credentials');
const backupDrivePassphrase = document.querySelector('#backup-drive-passphrase');
const backupDriveEnabled = document.querySelector('#backup-drive-enabled');
const testPlatformBackupDestinationButton = document.querySelector('#test-platform-backup-destination');
const savePlatformBackupDestinationButton = document.querySelector('#save-platform-backup-destination');
const tenantBackupPanel = document.querySelector('#tenant-backup-panel');
const createTenantBackupButton = document.querySelector('#create-tenant-backup');
const tenantBackupGoogleDrive = document.querySelector('#tenant-backup-google-drive');
const tenantBackupGoogleDriveDetail = document.querySelector('#tenant-backup-google-drive-detail');
const tenantBackupFeedback = document.querySelector('#tenant-backup-feedback');
const tenantBackupTableWrap = document.querySelector('#tenant-backup-table-wrap');
const tenantBackupBody = document.querySelector('#tenant-backup-body');
const tenantBackupEmpty = document.querySelector('#tenant-backup-empty');
const refreshServersButton = document.querySelector('#refresh-servers');
const serverTotal = document.querySelector('#server-total');
const serverHealthy = document.querySelector('#server-healthy');
const serverAttention = document.querySelector('#server-attention');
const serverOffline = document.querySelector('#server-offline');
const serversGeneratedAt = document.querySelector('#servers-generated-at');
const serversLoading = document.querySelector('#servers-loading');
const serversError = document.querySelector('#servers-error');
const serversErrorMessage = document.querySelector('#servers-error-message');
const serversList = document.querySelector('#servers-list');
const refreshContinuityButton = document.querySelector('#refresh-continuity');
const redundancyRole = document.querySelector('#redundancy-role');
const redundancyLocalRole = document.querySelector('#redundancy-local-role');
const redundancyReadOnly = document.querySelector('#redundancy-read-only');
const redundancySiteCount = document.querySelector('#redundancy-site-count');
const redundancyMigration = document.querySelector('#redundancy-migration');
const redundancyMigrationDetail = document.querySelector('#redundancy-migration-detail');
const redundancySites = document.querySelector('#redundancy-sites');
const configureRedundancyPrimaryButton = document.querySelector('#configure-redundancy-primary');
const createRedundancyEnrollmentButton = document.querySelector('#create-redundancy-enrollment');
const advanceRedundancyMigrationButton = document.querySelector('#advance-redundancy-migration');
const promoteRedundancySecondaryButton = document.querySelector('#promote-redundancy-secondary');
const redundancyEnrollmentCommand = document.querySelector('#redundancy-enrollment-command');
const redundancyToken = document.querySelector('#redundancy-token');
const copyRedundancyTokenButton = document.querySelector('#copy-redundancy-token');
const redundancyFeedback = document.querySelector('#redundancy-feedback');
const continuityStatus = document.querySelector('#continuity-status');
const continuityStatusDetail = document.querySelector('#continuity-status-detail');
const continuityRpo = document.querySelector('#continuity-rpo');
const continuityReady = document.querySelector('#continuity-ready');
const continuitySites = document.querySelector('#continuity-sites');
const continuityGeneratedAt = document.querySelector('#continuity-generated-at');
const continuityLoading = document.querySelector('#continuity-loading');
const continuityError = document.querySelector('#continuity-error');
const continuityErrorMessage = document.querySelector('#continuity-error-message');
const continuityTopology = document.querySelector('#continuity-topology');
const continuityObserver = document.querySelector('#continuity-observer');
const continuityTechnical = document.querySelector('#continuity-technical');
const continuityComponents = document.querySelector('#continuity-components');
const continuitySiteA = document.querySelector('#continuity-site-a');
const continuitySiteAName = document.querySelector('#continuity-site-a-name');
const continuitySiteAVm = document.querySelector('#continuity-site-a-vm');
const continuitySiteARole = document.querySelector('#continuity-site-a-role');
const continuitySiteAPostgres = document.querySelector('#continuity-site-a-postgres');
const continuitySiteAPostgresStatus = document.querySelector('#continuity-site-a-postgres-status');
const continuitySiteAClickhouse = document.querySelector('#continuity-site-a-clickhouse');
const continuitySiteAClickhouseStatus = document.querySelector('#continuity-site-a-clickhouse-status');
const continuitySiteAApp = document.querySelector('#continuity-site-a-app');
const continuitySiteAAppStatus = document.querySelector('#continuity-site-a-app-status');
const continuitySiteAAddress = document.querySelector('#continuity-site-a-address');
const continuitySiteB = document.querySelector('#continuity-site-b');
const continuitySiteBName = document.querySelector('#continuity-site-b-name');
const continuitySiteBVm = document.querySelector('#continuity-site-b-vm');
const continuitySiteBRole = document.querySelector('#continuity-site-b-role');
const continuitySiteBPostgres = document.querySelector('#continuity-site-b-postgres');
const continuitySiteBPostgresStatus = document.querySelector('#continuity-site-b-postgres-status');
const continuitySiteBClickhouse = document.querySelector('#continuity-site-b-clickhouse');
const continuitySiteBClickhouseStatus = document.querySelector('#continuity-site-b-clickhouse-status');
const continuitySiteBApp = document.querySelector('#continuity-site-b-app');
const continuitySiteBAppStatus = document.querySelector('#continuity-site-b-app-status');
const continuitySiteBAddress = document.querySelector('#continuity-site-b-address');
const continuityReplicationLane = document.querySelector('#continuity-replication-lane');
const continuityCopyStatus = document.querySelector('#continuity-copy-status');
const continuityCopyDetail = document.querySelector('#continuity-copy-detail');
const continuitySettingsPanel = document.querySelector('#continuity-settings-panel');
const configureContinuityButton = document.querySelector('#configure-continuity');
const continuitySettingsDialog = document.querySelector('#continuity-settings-dialog');
const closeContinuitySettingsButton = document.querySelector('#close-continuity-settings');
const continuitySettingsForm = document.querySelector('#continuity-settings-form');
const continuitySiteAInput = document.querySelector('#continuity-site-a-input');
const continuitySiteBInput = document.querySelector('#continuity-site-b-input');
const continuitySiteAHostInput = document.querySelector('#continuity-site-a-host');
const continuitySiteBHostInput = document.querySelector('#continuity-site-b-host');
const continuitySettingsSource = document.querySelector('#continuity-settings-source');
const continuitySettingsOrigin = document.querySelector('#continuity-settings-origin');
const continuitySettingsConnections = document.querySelector('#continuity-settings-connections');
const continuitySettingsTest = document.querySelector('#continuity-settings-test');
const continuitySettingsTestDetail = document.querySelector('#continuity-settings-test-detail');
const continuityRoutingOverview = document.querySelector('#continuity-routing-overview');
const continuityRoutingPanel = document.querySelector('#continuity-routing-panel');
const continuityRoutingIngest = document.querySelector('#continuity-routing-ingest');
const continuityRoutingControl = document.querySelector('#continuity-routing-control');
const continuityRoutingDetail = document.querySelector('#continuity-routing-detail');
const continuitySettingsFeedback = document.querySelector('#continuity-settings-feedback');
const saveContinuitySettingsButton = document.querySelector('#save-continuity-settings');
const continuityWizardTestState = document.querySelector('#continuity-wizard-test-state');
const continuityWizardTestCopy = document.querySelector('#continuity-wizard-test-copy');
const continuityEnrollmentCommand = document.querySelector('#continuity-enrollment-command');
const continuityCommand = document.querySelector('#continuity-command');
const copyContinuityCommandButton = document.querySelector('#copy-continuity-command');
const revokeContinuityEnrollmentButton = document.querySelector('#revoke-continuity-enrollment');
const serverHistoryServer = document.querySelector('#server-history-server');
const serverHistoryPeriodButtons = [...document.querySelectorAll('[data-server-period]')];
const serverHistoryLoading = document.querySelector('#server-history-loading');
const serverHistoryError = document.querySelector('#server-history-error');
const serverHistoryErrorMessage = document.querySelector('#server-history-error-message');
const serverHistoryEmpty = document.querySelector('#server-history-empty');
const serverHistoryContent = document.querySelector('#server-history-content');
const serverHistorySummary = document.querySelector('#server-history-summary');
const serverHistoryChartWrap = document.querySelector('#server-history-chart-wrap');
const serverHistoryChart = document.querySelector('#server-history-chart');
const serverHistoryTooltip = document.querySelector('#server-history-tooltip');
const serverNetworkHistoryChart = document.querySelector('#server-network-history-chart');
const serverNetworkHistoryTooltip = document.querySelector('#server-network-history-tooltip');
const serverHistoryUpdated = document.querySelector('#server-history-updated');
const capacityNav = document.querySelector('#capacity-nav');
const refreshDashboardButton = document.querySelector('#refresh-dashboard');
const dashboardPeriod = document.querySelector('#dashboard-period');
const dashboardEvents = document.querySelector('#dashboard-events');
const dashboardRawRecords = document.querySelector('#dashboard-raw-records');
const dashboardAllocations = document.querySelector('#dashboard-allocations');
const dashboardDeallocations = document.querySelector('#dashboard-deallocations');
const dashboardPublicIps = document.querySelector('#dashboard-public-ips');
const dashboardPrivateIps = document.querySelector('#dashboard-private-ips');
const dashboardPublicAllocatedIp = document.querySelector('#dashboard-public-allocated-ip');
const dashboardPublicAllocatedDetail = document.querySelector('#dashboard-public-allocated-detail');
const dashboardPublicDeallocatedIp = document.querySelector('#dashboard-public-deallocated-ip');
const dashboardPublicDeallocatedDetail = document.querySelector('#dashboard-public-deallocated-detail');
const dashboardPrivateAllocatedIp = document.querySelector('#dashboard-private-allocated-ip');
const dashboardPrivateAllocatedDetail = document.querySelector('#dashboard-private-allocated-detail');
const dashboardLastEvent = document.querySelector('#dashboard-last-event');
const dashboardGeneratedAt = document.querySelector('#dashboard-generated-at');
const dashboardLoading = document.querySelector('#dashboard-loading');
const dashboardError = document.querySelector('#dashboard-error');
const dashboardErrorMessage = document.querySelector('#dashboard-error-message');
const dashboardEmpty = document.querySelector('#dashboard-empty');
const dashboardChartWrap = document.querySelector('#dashboard-chart-wrap');
const dashboardChart = document.querySelector('#dashboard-chart');
const refreshCapacityButton = document.querySelector('#refresh-capacity');
const capacityEventsRate = document.querySelector('#capacity-events-rate');
const capacityEventsPeak = document.querySelector('#capacity-events-peak');
const capacityDailyStorage = document.querySelector('#capacity-daily-storage');
const capacityRetentionStorage = document.querySelector('#capacity-retention-storage');
const capacityCurrentStorage = document.querySelector('#capacity-current-storage');
const capacityCurrentStorageLabel = document.querySelector('#capacity-current-storage-label');
const capacityCoverage = document.querySelector('#capacity-coverage');
const capacitySpool = document.querySelector('#capacity-spool');
const capacityQueryP95 = document.querySelector('#capacity-query-p95');
const capacityQuerySamples = document.querySelector('#capacity-query-samples');
const capacityDevices = document.querySelector('#capacity-devices');
const capacityEntitiesLabel = document.querySelector('#capacity-entities-label');
const capacityEntitiesDetail = document.querySelector('#capacity-entities-detail');
const capacityGeneratedAt = document.querySelector('#capacity-generated-at');
const capacityLoading = document.querySelector('#capacity-loading');
const capacityError = document.querySelector('#capacity-error');
const capacityErrorMessage = document.querySelector('#capacity-error-message');
const capacityTableWrap = document.querySelector('#capacity-table-wrap');
const capacityBody = document.querySelector('#capacity-body');
const capacityTableTitle = document.querySelector('#capacity-table-title');
const capacityOriginHeading = document.querySelector('#capacity-origin-heading');
const capacityRawHeading = document.querySelector('#capacity-raw-heading');
const capacityCurrentHeading = document.querySelector('#capacity-current-heading');
const capacityRetentionHeading = document.querySelector('#capacity-retention-heading');
const capacityLiveTab = document.querySelector('#capacity-live-tab');
const capacityCalculatorTab = document.querySelector('#capacity-calculator-tab');
const capacityLivePanel = document.querySelector('#capacity-live-panel');
const capacityCalculatorPanel = document.querySelector('#capacity-calculator-panel');
const capacityTechnicalNote = document.querySelector('#capacity-technical-note');
const capacityCalculatorForm = document.querySelector('#capacity-calculator-form');
const capacitySubscribers = document.querySelector('#capacity-subscribers');
const capacityVendorScenario = document.querySelector('#capacity-vendor-scenario');
const capacityCiscoMixField = document.querySelector('#capacity-cisco-mix-field');
const capacityCiscoPercent = document.querySelector('#capacity-cisco-percent');
const capacityGrowthPercent = document.querySelector('#capacity-growth-percent');
const capacityHeadroomPercent = document.querySelector('#capacity-headroom-percent');
const capacityOfflineHours = document.querySelector('#capacity-offline-hours');
const capacityCalculateButton = document.querySelector('#capacity-calculate-button');
const capacityCalculatorFeedback = document.querySelector('#capacity-calculator-feedback');
const capacityCalculatorResults = document.querySelector('#capacity-calculator-results');
const capacityEstimateDetail = document.querySelector('#capacity-estimate-detail');
const capacityEstimateMonthly = document.querySelector('#capacity-estimate-monthly');
const capacityEstimateRetention = document.querySelector('#capacity-estimate-retention');
const capacityEstimateBackups = document.querySelector('#capacity-estimate-backups');
const capacityEstimateDisk = document.querySelector('#capacity-estimate-disk');
const capacityEstimateSubscribers = document.querySelector('#capacity-estimate-subscribers');
const capacityEstimateMix = document.querySelector('#capacity-estimate-mix');
const capacityEstimateBaseline = document.querySelector('#capacity-estimate-baseline');
const capacityEstimateFree = document.querySelector('#capacity-estimate-free');
const capacityEdgeEstimate = document.querySelector('#capacity-edge-estimate');
const capacityEdgeWindow = document.querySelector('#capacity-edge-window');
const capacityEdgeSpool = document.querySelector('#capacity-edge-spool');
const capacityEdgeSystem = document.querySelector('#capacity-edge-system');
const capacityEdgeFree = document.querySelector('#capacity-edge-free');
const capacityEdgeDisk = document.querySelector('#capacity-edge-disk');
const capacityEdgeExplanation = document.querySelector('#capacity-edge-explanation');
const collectorManagementPanel = document.querySelector('#collector-management-panel');
const createCollectorForm = document.querySelector('#create-collector-form');
const createCollectorButton = document.querySelector('#create-collector-button');
const createCollectorFeedback = document.querySelector('#create-collector-feedback');
const collectorDialog = document.querySelector('#collector-dialog');
const editCollectorForm = document.querySelector('#edit-collector-form');
const editCollectorSubmit = document.querySelector('#edit-collector-submit');
const editCollectorFeedback = document.querySelector('#edit-collector-feedback');
const closeCollectorDialog = document.querySelector('#close-collector-dialog');
const credentialDialog = document.querySelector('#credential-dialog');
const credentialConfig = document.querySelector('#credential-config');
const credentialFeedback = document.querySelector('#credential-feedback');
const copyCredentialButton = document.querySelector('#copy-credential-button');
const usersNav = document.querySelector('#users-nav');
const platformUsersNav = document.querySelector('#platform-users-nav');
const companyNav = document.querySelector('#company-nav');
const clientsNav = document.querySelector('#clients-nav');
const plansNav = document.querySelector('#plans-nav');
const platformCapacityNav = document.querySelector('#platform-capacity-nav');
const platformSystemNav = document.querySelector('#platform-system-nav');
const platformServersNav = document.querySelector('#platform-servers-nav');
const platformContinuityNav = document.querySelector('#platform-continuity-nav');
const firewallNav = document.querySelector('#firewall-nav');
const platformFirewallNav = document.querySelector('#platform-firewall-nav');
const platformCollectorsNav = document.querySelector('#platform-collectors-nav');
const platformDevicesNav = document.querySelector('#platform-devices-nav');
const platformAlertsNav = document.querySelector('#platform-alerts-nav');
const platformAuditNav = document.querySelector('#platform-audit-nav');
const platformSettingsNav = document.querySelector('#platform-settings-nav');
const platformManualNav = document.querySelector('#platform-manual-nav');
const platformNavGroup = document.querySelector('#platform-nav-group');
const manualSearch = document.querySelector('#manual-search');
const manualSearchEmpty = document.querySelector('#manual-search-empty');
const manualSections = [...document.querySelectorAll('[data-manual-section]')];
const manualIndexButtons = [...document.querySelectorAll('[data-manual-target]')];
const printManualButton = document.querySelector('#print-manual');
const alertsIntroCopy = document.querySelector('#alerts-intro-copy');
const serversIntroCopy = document.querySelector('#servers-intro-copy');
const firewallViewTitle = document.querySelector('#firewall-view-title');
const firewallIntroCopy = document.querySelector('#firewall-intro-copy');
const refreshFirewallButton = document.querySelector('#refresh-firewall');
const firewallTabs = document.querySelector('#firewall-tabs');
const firewallAccessTab = document.querySelector('#firewall-access-tab');
const firewallIngestionTab = document.querySelector('#firewall-ingestion-tab');
const firewallAccessPanel = document.querySelector('#firewall-access-panel');
const firewallIngestionPanel = document.querySelector('#firewall-ingestion-panel');
const firewallRuleSearch = document.querySelector('#firewall-rule-search');
const firewallRuleFilter = document.querySelector('#firewall-rule-filter');
const firewallNewRuleButton = document.querySelector('#firewall-new-rule');
const firewallServicePolicies = document.querySelector('#firewall-service-policies');
const firewallRuleBody = document.querySelector('#firewall-rule-body');
const firewallRulesEmpty = document.querySelector('#firewall-rules-empty');
const firewallRuleDialog = document.querySelector('#firewall-rule-dialog');
const firewallRuleForm = document.querySelector('#firewall-rule-form');
const firewallRuleDialogTitle = document.querySelector('#firewall-rule-dialog-title');
const closeFirewallRuleDialog = document.querySelector('#close-firewall-rule-dialog');
const firewallRuleId = document.querySelector('#firewall-rule-id');
const firewallRuleSource = document.querySelector('#firewall-rule-source');
const firewallRuleDescription = document.querySelector('#firewall-rule-description');
const firewallRuleService = document.querySelector('#firewall-rule-service');
const firewallRuleFeedback = document.querySelector('#firewall-rule-feedback');
const firewallRuleSubmit = document.querySelector('#firewall-rule-submit');
const firewallCloudTotal = document.querySelector('#firewall-cloud-total');
const firewallEnforcing = document.querySelector('#firewall-enforcing');
const firewallMonitoring = document.querySelector('#firewall-monitoring');
const firewallBlocked = document.querySelector('#firewall-blocked');
const firewallGeneratedAt = document.querySelector('#firewall-generated-at');
const firewallLoading = document.querySelector('#firewall-loading');
const firewallError = document.querySelector('#firewall-error');
const firewallErrorMessage = document.querySelector('#firewall-error-message');
const firewallCollectorList = document.querySelector('#firewall-collector-list');
const refreshUsersButton = document.querySelector('#refresh-users');
const usersLoading = document.querySelector('#users-loading');
const usersError = document.querySelector('#users-error');
const usersErrorMessage = document.querySelector('#users-error-message');
const usersTableWrap = document.querySelector('#users-table-wrap');
const usersBody = document.querySelector('#users-body');
const usersGeneratedAt = document.querySelector('#users-generated-at');
const userTotal = document.querySelector('#user-total');
const userActive = document.querySelector('#user-active');
const userAdmins = document.querySelector('#user-admins');
const userAdminsLabel = document.querySelector('#user-admins-label');
const userAdminsDetail = document.querySelector('#user-admins-detail');
const createUserForm = document.querySelector('#create-user-form');
const createUserButton = document.querySelector('#create-user-button');
const createUserFeedback = document.querySelector('#create-user-feedback');
const usersViewTitle = document.querySelector('#users-view-title');
const usersViewCopy = document.querySelector('#users-view-copy');
const newUserRole = document.querySelector('#new-user-role');
const newUserRoleField = document.querySelector('#new-user-role-field');
const newUserAccessProfileField = document.querySelector('#new-user-access-profile-field');
const newUserAccessProfile = document.querySelector('#new-user-access-profile');
const accessProfilesPanel = document.querySelector('#access-profiles-panel');
const accessProfilesLoading = document.querySelector('#access-profiles-loading');
const accessProfileList = document.querySelector('#access-profile-list');
const addAccessProfileButton = document.querySelector('#add-access-profile');
const accessProfileDialog = document.querySelector('#access-profile-dialog');
const accessProfileForm = document.querySelector('#access-profile-form');
const accessProfileDialogTitle = document.querySelector('#access-profile-dialog-title');
const accessProfileMatrix = document.querySelector('#access-profile-matrix');
const accessProfileFeedback = document.querySelector('#access-profile-feedback');
const closeAccessProfileDialogButton = document.querySelector('#close-access-profile-dialog');
const cancelAccessProfileButton = document.querySelector('#cancel-access-profile');
const setFullAccessProfileButton = document.querySelector('#set-full-access-profile');
const saveAccessProfileButton = document.querySelector('#save-access-profile');
const userCreatePanel = document.querySelector('.user-create-panel');
const changePasswordButton = document.querySelector('#change-password-button');
const passwordDialog = document.querySelector('#password-dialog');
const closePasswordDialog = document.querySelector('#close-password-dialog');
const changePasswordForm = document.querySelector('#change-password-form');
const changePasswordSubmit = document.querySelector('#change-password-submit');
const passwordFeedback = document.querySelector('#password-feedback');
const auditNav = document.querySelector('#audit-nav');
const refreshAuditButton = document.querySelector('#refresh-audit');
const auditCategory = document.querySelector('#audit-category');
const auditLoading = document.querySelector('#audit-loading');
const auditError = document.querySelector('#audit-error');
const auditErrorMessage = document.querySelector('#audit-error-message');
const auditTableWrap = document.querySelector('#audit-table-wrap');
const auditBody = document.querySelector('#audit-body');
const auditGeneratedAt = document.querySelector('#audit-generated-at');
const auditSearches = document.querySelector('#audit-searches');
const auditExports = document.querySelector('#audit-exports');
const auditLoginFailures = document.querySelector('#audit-login-failures');
const auditUserChanges = document.querySelector('#audit-user-changes');
const deviceManagementPanel = document.querySelector('#device-management-panel');
const createDeviceForm = document.querySelector('#create-device-form');
const createDeviceButton = document.querySelector('#create-device-button');
const createDeviceFeedback = document.querySelector('#create-device-feedback');
const discoverDevicesButton = document.querySelector('#discover-devices');
const deviceDiscoveryDialog = document.querySelector('#device-discovery-dialog');
const closeDeviceDiscoveryButton = document.querySelector('#close-device-discovery');
const deviceDiscoveryForm = document.querySelector('#device-discovery-form');
const deviceDiscoveryCollector = document.querySelector('#device-discovery-collector');
const startDeviceDiscoveryButton = document.querySelector('#start-device-discovery');
const deviceDiscoveryProgress = document.querySelector('#device-discovery-progress');
const deviceDiscoveryCountdown = document.querySelector('#device-discovery-countdown');
const deviceDiscoveryProgressBar = document.querySelector('#device-discovery-progress-bar');
const deviceDiscoveryCollectorName = document.querySelector('#device-discovery-collector-name');
const deviceDiscoveryFeedback = document.querySelector('#device-discovery-feedback');
const deviceDiscoveryResults = document.querySelector('#device-discovery-results');
const deviceDiscoverySummary = document.querySelector('#device-discovery-summary');
const deviceDiscoveryCandidates = document.querySelector('#device-discovery-candidates');
const deviceDialog = document.querySelector('#device-dialog');
const editDeviceForm = document.querySelector('#edit-device-form');
const editDeviceSubmit = document.querySelector('#edit-device-submit');
const editDeviceFeedback = document.querySelector('#edit-device-feedback');
const closeDeviceDialog = document.querySelector('#close-device-dialog');
const refreshClientsButton = document.querySelector('#refresh-clients');
const clientsLoading = document.querySelector('#clients-loading');
const clientsError = document.querySelector('#clients-error');
const clientsErrorMessage = document.querySelector('#clients-error-message');
const clientsTableWrap = document.querySelector('#clients-table-wrap');
const clientsBody = document.querySelector('#clients-body');
const clientsGeneratedAt = document.querySelector('#clients-generated-at');
const clientTotal = document.querySelector('#client-total');
const clientActive = document.querySelector('#client-active');
const clientDevices = document.querySelector('#client-devices');
const clientCollectors = document.querySelector('#client-collectors');
const createClientForm = document.querySelector('#create-client-form');
const createClientButton = document.querySelector('#create-client-button');
const createClientFeedback = document.querySelector('#create-client-feedback');
const generateClientPasswordButton = document.querySelector('#generate-client-password');
const openClientWizardButton = document.querySelector('#open-client-wizard');
const clientWizardDialog = document.querySelector('#client-wizard-dialog');
const closeClientWizardButton = document.querySelector('#close-client-wizard');
const clientWizardBackButton = document.querySelector('#client-wizard-back');
const clientWizardNextButton = document.querySelector('#client-wizard-next');
const clientWizardSteps = [...document.querySelectorAll('[data-client-step]')];
const clientWizardIndicators = [...document.querySelectorAll('[data-client-step-indicator]')];
const clientWizardPlanName = document.querySelector('#client-wizard-plan-name');
const clientWizardPlanDetail = document.querySelector('#client-wizard-plan-detail');
const clientReviewName = document.querySelector('#client-review-name');
const clientReviewPlan = document.querySelector('#client-review-plan');
const clientReviewLimit = document.querySelector('#client-review-limit');
const clientReviewAdmin = document.querySelector('#client-review-admin');
const newCompanyLogoLabel = document.querySelector('#new-company-logo-label');
const createPlanForm = document.querySelector('#create-plan-form');
const planManagementPanel = document.querySelector('#plan-management-panel');
const clientOnboardingCard = document.querySelector('#client-onboarding-card');
const createPlanButton = document.querySelector('#create-plan-button');
const createPlanFeedback = document.querySelector('#create-plan-feedback');
const plansBody = document.querySelector('#plans-body');
const refreshPlansButton = document.querySelector('#refresh-plans');
const plansLoading = document.querySelector('#plans-loading');
const plansError = document.querySelector('#plans-error');
const plansErrorMessage = document.querySelector('#plans-error-message');
const plansTableWrap = document.querySelector('#plans-table-wrap');
const plansGeneratedAt = document.querySelector('#plans-generated-at');
const planTotal = document.querySelector('#plan-total');
const planAssigned = document.querySelector('#plan-assigned');
const planLimited = document.querySelector('#plan-limited');
const planUnlimited = document.querySelector('#plan-unlimited');
const refreshPlatformEmailButton = document.querySelector('#refresh-platform-email');
const platformEmailLoading = document.querySelector('#platform-email-loading');
const platformEmailError = document.querySelector('#platform-email-error');
const platformEmailErrorMessage = document.querySelector('#platform-email-error-message');
const platformEmailForm = document.querySelector('#platform-email-form');
const platformEmailFeedback = document.querySelector('#platform-email-feedback');
const savePlatformEmailButton = document.querySelector('#save-platform-email');
const platformEmailMasterState = document.querySelector('#platform-email-master-state');
const toggleSmtpPasswordButton = document.querySelector('#toggle-smtp-password');
const smtpPasswordHelp = document.querySelector('#smtp-password-help');
const platformEmailTestForm = document.querySelector('#platform-email-test-form');
const platformEmailTestPanel = document.querySelector('#platform-email-test-panel');
const testPlatformEmailButton = document.querySelector('#test-platform-email');
const platformEmailTestFeedback = document.querySelector('#platform-email-test-feedback');
const platformEmailStatus = document.querySelector('#platform-email-status');
const platformEmailSource = document.querySelector('#platform-email-source');
const platformEmailServer = document.querySelector('#platform-email-server');
const platformEmailSecurity = document.querySelector('#platform-email-security');
const platformEmailFrom = document.querySelector('#platform-email-from');
const platformEmailLastTest = document.querySelector('#platform-email-last-test');
const platformEmailTestStatus = document.querySelector('#platform-email-test-status');
const platformEmailUpdated = document.querySelector('#platform-email-updated');
const deleteClientDialog = document.querySelector('#delete-client-dialog');
const deleteClientForm = document.querySelector('#delete-client-form');
const deleteClientName = document.querySelector('#delete-client-name');
const deleteClientBackupNotice = document.querySelector('#delete-client-backup-notice');
const deleteClientFeedback = document.querySelector('#delete-client-feedback');
const deleteClientSubmit = document.querySelector('#delete-client-submit');
const closeDeleteClientDialog = document.querySelector('#close-delete-client-dialog');
const platformAuditTenant = document.querySelector('#platform-audit-tenant');
const platformAuditAction = document.querySelector('#platform-audit-action');
const exportPlatformAuditButton = document.querySelector('#export-platform-audit');
const refreshPlatformAuditButton = document.querySelector('#refresh-platform-audit');
const platformAuditEvents = document.querySelector('#platform-audit-events');
const platformAuditCreated = document.querySelector('#platform-audit-created');
const platformAuditPlanChanges = document.querySelector('#platform-audit-plan-changes');
const platformAuditAccessChanges = document.querySelector('#platform-audit-access-changes');
const platformAuditGeneratedAt = document.querySelector('#platform-audit-generated-at');
const platformAuditLoading = document.querySelector('#platform-audit-loading');
const platformAuditError = document.querySelector('#platform-audit-error');
const platformAuditErrorMessage = document.querySelector('#platform-audit-error-message');
const platformAuditEmpty = document.querySelector('#platform-audit-empty');
const platformAuditTableWrap = document.querySelector('#platform-audit-table-wrap');
const platformAuditBody = document.querySelector('#platform-audit-body');
const companyView = document.querySelector('#company-view');
const companyProfileForm = document.querySelector('#company-profile-form');
const companyProfileUpdated = document.querySelector('#company-profile-updated');
const companyProfileFeedback = document.querySelector('#company-profile-feedback');
const companyLogoFile = document.querySelector('#company-logo-file');
const companyLogoPreview = document.querySelector('#company-logo-preview');
const removeCompanyLogoButton = document.querySelector('#remove-company-logo');
const saveCompanyProfileButton = document.querySelector('#save-company-profile');
const platformCompanyDialog = document.querySelector('#platform-company-dialog');
const platformCompanyForm = document.querySelector('#platform-company-form');
const platformCompanyTitle = document.querySelector('#platform-company-title');
const platformCompanyFeedback = document.querySelector('#platform-company-feedback');
const platformCompanyLogoFile = document.querySelector('#platform-company-logo-file');
const platformCompanyLogoPreview = document.querySelector('#platform-company-logo-preview');
const removePlatformCompanyLogoButton = document.querySelector('#remove-platform-company-logo');
const savePlatformCompanyButton = document.querySelector('#save-platform-company');
const closePlatformCompanyDialogButton = document.querySelector('#close-platform-company-dialog');
const cancelPlatformCompanyButton = document.querySelector('#cancel-platform-company');
const platformClientUsersDialog = document.querySelector('#platform-client-users-dialog');
const platformClientUsersTitle = document.querySelector('#platform-client-users-title');
const platformClientUsersTenantId = document.querySelector('#platform-client-users-tenant-id');
const closePlatformClientUsersButton = document.querySelector('#close-platform-client-users');
const finishPlatformClientUsersButton = document.querySelector('#finish-platform-client-users');
const platformClientUserTotal = document.querySelector('#platform-client-user-total');
const platformClientUserActive = document.querySelector('#platform-client-user-active');
const platformClientUserAdmins = document.querySelector('#platform-client-user-admins');
const platformClientUserCreateForm = document.querySelector('#platform-client-user-create-form');
const createPlatformClientUserButton = document.querySelector('#create-platform-client-user');
const generatePlatformUserPasswordButton = document.querySelector('#generate-platform-user-password');
const platformClientUserCreateFeedback = document.querySelector('#platform-client-user-create-feedback');
const refreshPlatformClientUsersButton = document.querySelector('#refresh-platform-client-users');
const platformClientUsersLoading = document.querySelector('#platform-client-users-loading');
const platformClientUsersError = document.querySelector('#platform-client-users-error');
const platformClientUsersErrorMessage = document.querySelector('#platform-client-users-error-message');
const platformClientUsersEmpty = document.querySelector('#platform-client-users-empty');
const platformClientUsersTableWrap = document.querySelector('#platform-client-users-table-wrap');
const platformClientUsersBody = document.querySelector('#platform-client-users-body');
const platformUserPasswordDialog = document.querySelector('#platform-user-password-dialog');
const platformUserPasswordForm = document.querySelector('#platform-user-password-form');
const platformUserPasswordIdentity = document.querySelector('#platform-user-password-identity');
const platformUserNewPassword = document.querySelector('#platform-user-new-password');
const generatePlatformUserNewPasswordButton = document.querySelector('#generate-platform-user-new-password');
const resetPlatformUserPasswordButton = document.querySelector('#reset-platform-user-password');
const platformUserPasswordFeedback = document.querySelector('#platform-user-password-feedback');
const closePlatformUserPasswordButton = document.querySelector('#close-platform-user-password');
const officialReportDialog = document.querySelector('#official-report-dialog');
const officialReportForm = document.querySelector('#official-report-form');
const officialReportSelection = document.querySelector('#official-report-selection');
const officialReportFeedback = document.querySelector('#official-report-feedback');
const generateOfficialReportButton = document.querySelector('#generate-official-report');
const closeOfficialReportDialogButton = document.querySelector('#close-official-report-dialog');
const deleteOfficialReportDialog = document.querySelector('#delete-official-report-dialog');
const deleteOfficialReportForm = document.querySelector('#delete-official-report-form');
const deleteOfficialReportReference = document.querySelector('#delete-official-report-reference');
const deleteOfficialReportFeedback = document.querySelector('#delete-official-report-feedback');
const deleteOfficialReportSubmit = document.querySelector('#delete-official-report-submit');
const closeDeleteOfficialReportButton = document.querySelector('#close-delete-official-report');
const allocationCycleDialog = document.querySelector('#allocation-cycle-dialog');
const closeAllocationCycleDialogButton = document.querySelector('#close-allocation-cycle-dialog');
const allocationCycleTimezone = document.querySelector('#allocation-cycle-timezone');
const allocationCycleLoading = document.querySelector('#allocation-cycle-loading');
const allocationCycleError = document.querySelector('#allocation-cycle-error');
const allocationCycleErrorMessage = document.querySelector('#allocation-cycle-error-message');
const allocationCycleResult = document.querySelector('#allocation-cycle-result');
const allocationCycleSummary = document.querySelector('#allocation-cycle-summary');
const allocationCycleStatus = document.querySelector('#allocation-cycle-status');
const allocationCycleStatusTitle = document.querySelector('#allocation-cycle-status-title');
const allocationCycleStatusCopy = document.querySelector('#allocation-cycle-status-copy');
const allocationCycleAllocatedAt = document.querySelector('#allocation-cycle-allocated-at');
const allocationCycleAllocatedReceived = document.querySelector('#allocation-cycle-allocated-received');
const allocationCycleDuration = document.querySelector('#allocation-cycle-duration');
const allocationCycleSecondEvent = document.querySelector('#allocation-cycle-second-event');
const allocationCycleSecondMarker = document.querySelector('#allocation-cycle-second-marker');
const allocationCycleSecondLabel = document.querySelector('#allocation-cycle-second-label');
const allocationCycleSecondAt = document.querySelector('#allocation-cycle-second-at');
const allocationCycleSecondReceived = document.querySelector('#allocation-cycle-second-received');
const allocationCycleNote = document.querySelector('#allocation-cycle-note');
const refreshOfficialReportsButton = document.querySelector('#refresh-official-reports');
const officialReportsLoading = document.querySelector('#official-reports-loading');
const officialReportsEmpty = document.querySelector('#official-reports-empty');
const officialReportsWrap = document.querySelector('#official-reports-wrap');
const officialReportsBody = document.querySelector('#official-reports-body');
let lastQuery = null;
let lastSearchContext = null;
let dashboardLoaded = false;
let platformDashboardLoaded = false;
let devicesLoaded = false;
let collectorsLoaded = false;
let firewallLoaded = false;
let latestInfrastructureFirewallPolicies = [];
let systemLoaded = false;
let alertsLoaded = false;
let serversLoaded = false;
let continuityLoaded = false;
let continuityEnrollmentLoaded = false;
let currentContinuityEnrollment = null;
let currentContinuityRouting = null;
let currentContinuityDefaults = null;
let latestContinuitySnapshot = null;
let continuityEnrollmentPollTimer = null;
let tenantBackupPollTimer = null;
let capacityLoaded = false;
let usersLoaded = false;
let auditLoaded = false;
let clientsLoaded = false;
let plansLoaded = false;
let platformEmailLoaded = false;
let companyProfileLoaded = false;
let officialReportsLoaded = false;
let integrationsLoaded = false;
let integrationTargetsLoaded = false;
let integrationProviderAvailability = null;
let currentIntegration = null;
let integrationWizardStep = 1;
let integrationWizardEditing = false;
let currentUser = null;
let availableAccessProfiles = [];
let availableCollectors = [];
let currentDevicePlan = null;
let availablePlans = [];
let clientDeletionPolicy = null;
let clientsPollTimer = null;
let serversPollTimer = null;
let continuityPollTimer = null;
let availableServers = [];
let serverHistoryPeriod = '5m';
let serverHistoryRequest = 0;
let discoveryPollTimer = null;
let currentDiscoverySession = null;
let alertChannelDrafts = createAlertChannelDrafts();
let activeAlertDestinationType = 'generic';
let configuredAlertDestinationType = null;
let alertWizardStep = 1;
let alertNotificationSettings = [];
let editingAlertSettingId = null;
let companyLogoDataUrl = null;
let removeCompanyLogo = false;
let platformCompanyLogoDataUrl = null;
let removePlatformCompanyLogo = false;
let officialReportsPollTimer = null;
let clientWizardStep = 1;
const discoveryStorageKey = 'argus.deviceDiscoverySessionId';

function secureRandomCharacter(characters) {
  const random = new Uint32Array(1);
  window.crypto.getRandomValues(random);
  return characters[random[0] % characters.length];
}

function generateSecurePassword() {
  const groups = [
    'abcdefghijkmnopqrstuvwxyz',
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    '23456789',
    '!@#$%*-_=+?'
  ];
  const password = groups.map(secureRandomCharacter);
  const allCharacters = groups.join('');
  while (password.length < 20) password.push(secureRandomCharacter(allCharacters));
  for (let index = password.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    window.crypto.getRandomValues(random);
    const swapIndex = random[0] % (index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }
  return password.join('');
}

function dateTimeValueInTimezone(date, timezone) {
  const parts = new Map(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}T${parts.get('hour')}:${parts.get('minute')}:${parts.get('second')}`;
}

const queryTimezonePresentation = {
  'America/Sao_Paulo': { option: 'GMT−3 — São Paulo', context: 'GMT−3 (São Paulo)' },
  'America/Manaus': { option: 'GMT−4 — Manaus', context: 'GMT−4 (Manaus)' },
  'America/Cuiaba': { option: 'GMT−4 — Cuiabá', context: 'GMT−4 (Cuiabá)' },
  'America/Rio_Branco': { option: 'GMT−5 — Rio Branco', context: 'GMT−5 (Rio Branco)' },
  'America/Noronha': { option: 'GMT−2 — Fernando de Noronha', context: 'GMT−2 (Fernando de Noronha)' },
  UTC: { option: 'GMT±0 — UTC', context: 'UTC' }
};

function queryTimezoneCopy(timezone) {
  return queryTimezonePresentation[timezone] || {
    option: `Fuso do cliente — ${timezone}`,
    context: timezone
  };
}

function queryTimezoneHintCopy(timezone) {
  if (timezone === 'UTC') return 'O horário informado já será interpretado como UTC.';
  return `O horário será interpretado como ${queryTimezoneCopy(timezone).context} e convertido para UTC.`;
}

function configureQueryTimezone(user) {
  const tenantTimezone = user?.tenant?.timezone || 'America/Sao_Paulo';
  const tenantLabel = queryTimezoneCopy(tenantTimezone).option;
  const options = [{ value: tenantTimezone, label: tenantLabel }];
  if (tenantTimezone !== 'UTC') options.push({ value: 'UTC', label: queryTimezoneCopy('UTC').option });
  queryTimezone.replaceChildren(...options.map(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }));
  queryTimezone.value = tenantTimezone;
  eventAtInput.value = dateTimeValueInTimezone(new Date(), tenantTimezone);
  queryTimezoneHint.textContent = queryTimezoneHintCopy(tenantTimezone);
}

queryTimezone.addEventListener('change', () => {
  queryTimezoneHint.textContent = queryTimezoneHintCopy(queryTimezone.value);
});

function setButtonLoading(button, loading) {
  button.disabled = loading;
  button.classList.toggle('loading', loading);
}

function setSearchLoading(loading) {
  setButtonLoading(searchButton, loading);
  form.querySelectorAll('input, select').forEach((element) => { element.disabled = loading; });
}

function setExports(enabled) {
  exportButtons.forEach((button) => { button.disabled = !enabled; });
}

function selectLoginMode(mode) {
  loginMode.hidden = mode !== 'login';
  passwordRecoveryMode.hidden = mode !== 'recovery';
  passwordResetMode.hidden = mode !== 'reset';
}

function setLoginFeedback(element, message = '', success = false) {
  element.hidden = !message;
  element.textContent = message;
  element.classList.toggle('success', success);
}

function showLogin(message = '', messageType = 'error') {
  appShell.hidden = true;
  loginScreen.hidden = false;
  selectLoginMode('login');
  loginError.hidden = !message;
  loginError.textContent = message;
  loginError.classList.toggle('success', messageType === 'success');
  loginForm.password.value = '';
  loginForm.password.type = 'password';
  toggleLoginPasswordButton.setAttribute('aria-pressed', 'false');
  toggleLoginPasswordButton.setAttribute('aria-label', 'Mostrar senha');
  toggleLoginPasswordButton.title = 'Mostrar senha';
  createClientForm.elements.adminPassword.value = '';
  createClientForm.elements.adminPassword.type = 'password';
  generateClientPasswordButton.textContent = 'Gerar';
  currentUser = null;
  currentDevicePlan = null;
  dashboardLoaded = false;
  platformDashboardLoaded = false;
  devicesLoaded = false;
  collectorsLoaded = false;
  firewallLoaded = false;
  systemLoaded = false;
  serversLoaded = false;
  continuityLoaded = false;
  continuityEnrollmentLoaded = false;
  currentContinuityEnrollment = null;
  currentContinuityRouting = null;
  currentContinuityDefaults = null;
  latestContinuitySnapshot = null;
  capacityLoaded = false;
  usersLoaded = false;
  auditLoaded = false;
  clientsLoaded = false;
  plansLoaded = false;
  platformEmailLoaded = false;
  companyProfileLoaded = false;
  officialReportsLoaded = false;
  integrationsLoaded = false;
  integrationTargetsLoaded = false;
  integrationProviderAvailability = null;
  lastSearchContext = null;
  if (clientsPollTimer) window.clearTimeout(clientsPollTimer);
  clientsPollTimer = null;
  if (officialReportsPollTimer) window.clearTimeout(officialReportsPollTimer);
  officialReportsPollTimer = null;
  if (serversPollTimer) window.clearTimeout(serversPollTimer);
  serversPollTimer = null;
  if (continuityPollTimer) window.clearTimeout(continuityPollTimer);
  continuityPollTimer = null;
  if (continuityEnrollmentPollTimer) window.clearTimeout(continuityEnrollmentPollTimer);
  continuityEnrollmentPollTimer = null;
  availableServers = [];
  serverHistoryRequest += 1;
  serverHistoryServer.replaceChildren();
  serverHistoryContent.hidden = true;
  serverHistoryEmpty.hidden = true;
  serverHistoryError.hidden = true;
  serverHistoryLoading.hidden = false;
  if (continuitySettingsDialog.open) continuitySettingsDialog.close();
  if (passwordDialog.open) passwordDialog.close();
  if (deviceDialog.open) deviceDialog.close();
  if (deviceDiscoveryDialog.open) deviceDiscoveryDialog.close();
  if (discoveryPollTimer) window.clearTimeout(discoveryPollTimer);
  discoveryPollTimer = null;
  currentDiscoverySession = null;
  if (collectorDialog.open) collectorDialog.close();
  if (credentialDialog.open) credentialDialog.close();
  if (deleteClientDialog.open) deleteClientDialog.close();
  if (officialReportDialog.open) officialReportDialog.close();
  if (deleteOfficialReportDialog.open) deleteOfficialReportDialog.close();
  if (integrationCatalogDialog.open) integrationCatalogDialog.close();
  if (integrationWizardDialog.open) integrationWizardDialog.close();
  if (deleteIntegrationDialog.open) deleteIntegrationDialog.close();
  if (allocationCycleDialog.open) allocationCycleDialog.close();
  if (alertInvestigationDialog.open) alertInvestigationDialog.close();
  if (platformCompanyDialog.open) platformCompanyDialog.close();
  if (platformClientUsersDialog.open) platformClientUsersDialog.close();
  if (platformUserPasswordDialog.open) platformUserPasswordDialog.close();
  if (clientWizardDialog.open) clientWizardDialog.close();
  document.body.classList.remove('menu-open');
  window.setTimeout(() => loginForm.email.focus(), 0);
}

function isPlatformContext(user = currentUser) {
  return Boolean(user?.platformAdmin && user.context === 'platform');
}

async function loadApplicationVersion() {
  try {
    const response = await fetch(`${API_BASE}/health/live`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) return;
    const payload = await response.json();
    if (typeof payload.version !== 'string' || !/^\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?$/.test(payload.version)) return;
    const displayVersion = payload.version.replace(/^(\d+\.\d+)\.0$/, '$1');
    applicationVersion.textContent = `Versão: ${displayVersion}`;
  } catch {
    // Mantém a versão incorporada no HTML quando a API ainda está inicializando.
  }
}

const platformViewModules = {
  dashboard: 'dashboard', devices: 'devices', collectors: 'collectors', system: 'system',
  servers: 'servers', continuity: 'continuity', firewall: 'firewall', alerts: 'alerts', capacity: 'capacity',
  clients: 'clients', plans: 'plans', integrations: 'integrations', users: 'users', 'platform-settings': 'settings', audit: 'audit'
};

function platformAccessLevel(module, user = currentUser) {
  if (!user?.platformAdmin) return 'none';
  if (user.platformOwner || !user.accessProfile?.permissions) return 'manage';
  return user.accessProfile.permissions[module] || 'none';
}

function hasPlatformPermission(module, required = 'view', user = currentUser) {
  const rank = { none: 0, view: 1, manage: 2 };
  return rank[platformAccessLevel(module, user)] >= rank[required];
}

function firstAllowedPlatformView(user = currentUser) {
  return Object.entries(platformViewModules).find(([, module]) => hasPlatformPermission(module, 'view', user))?.[0] || 'manual';
}

function viewFromLocation(user = currentUser) {
  const byHash = {
    '#dashboard': 'dashboard', '#consulta': 'query', '#equipamentos': 'devices',
    '#coletores': 'collectors', '#sistema': 'system', '#alertas': 'alerts',
    '#servidores': 'servers', '#continuidade': 'continuity', '#firewall': 'firewall', '#capacidade': 'capacity', '#clientes': 'clients',
    '#planos': 'plans', '#configuracoes': 'platform-settings', '#integracoes': 'integrations',
    '#usuarios': 'users', '#empresa': 'company', '#auditoria': 'audit', '#manual': 'manual'
  };
  const requested = byHash[window.location.hash] || 'dashboard';
  if (isPlatformContext(user)) {
    if (requested === 'manual') return requested;
    const module = platformViewModules[requested];
    return module && hasPlatformPermission(module, 'view', user) ? requested : firstAllowedPlatformView(user);
  }
  if (['clients', 'plans', 'platform-settings', 'manual'].includes(requested)) return 'dashboard';
  if (requested === 'capacity' && !['admin', 'auditor'].includes(user?.role)) return 'dashboard';
  if (requested === 'firewall' && !['admin', 'auditor'].includes(user?.role)) return 'dashboard';
  if (['users', 'company', 'integrations'].includes(requested) && user?.role !== 'admin') return 'dashboard';
  if (requested === 'integrations' && integrationProviderAvailability === false) return 'dashboard';
  if (requested === 'audit' && !['admin', 'auditor'].includes(user?.role)) return 'dashboard';
  return requested;
}

function showApplication(user) {
  currentUser = user;
  configureQueryTimezone(user);
  const platformContext = isPlatformContext(user);
  loginScreen.hidden = true;
  appShell.hidden = false;
  accountName.textContent = user.name;
  accountTenant.textContent = platformContext ? 'Administração da plataforma' : user.tenant.name;
  accountAvatar.textContent = user.name.trim().slice(0, 1).toUpperCase() || 'U';
  void loadApplicationVersion();
  overviewNavTitle.textContent = 'Visão geral';
  document.querySelector('[data-view="dashboard"]').hidden = platformContext && !hasPlatformPermission('dashboard', 'view', user);
  queryNav.hidden = platformContext;
  operationNavGroup.hidden = platformContext;
  platformOperationNavGroup.hidden = !platformContext;
  infrastructureNavGroup.hidden = platformContext;
  platformInfrastructureNavGroup.hidden = !platformContext;
  administrationNavGroup.hidden = platformContext;
  usersNav.hidden = platformContext || user.role !== 'admin';
  firewallNav.hidden = platformContext || !['admin', 'auditor'].includes(user.role);
  companyNav.hidden = platformContext || user.role !== 'admin';
  integrationsNav.hidden = true;
  erpQueryOption.hidden = true;
  clientsNav.hidden = !platformContext || !hasPlatformPermission('clients', 'view', user);
  plansNav.hidden = !platformContext || !hasPlatformPermission('plans', 'view', user);
  platformIntegrationsNav.hidden = !platformContext || !hasPlatformPermission('integrations', 'view', user);
  platformUsersNav.hidden = !platformContext || !hasPlatformPermission('users', 'view', user);
  platformCapacityNav.hidden = !platformContext || !hasPlatformPermission('capacity', 'view', user);
  platformSystemNav.hidden = !platformContext || !hasPlatformPermission('system', 'view', user);
  platformServersNav.hidden = !platformContext || !hasPlatformPermission('servers', 'view', user);
  platformContinuityNav.hidden = !platformContext || !hasPlatformPermission('continuity', 'view', user);
  platformFirewallNav.hidden = !platformContext || !hasPlatformPermission('firewall', 'view', user);
  platformCollectorsNav.hidden = !platformContext || !hasPlatformPermission('collectors', 'view', user);
  platformDevicesNav.hidden = !platformContext || !hasPlatformPermission('devices', 'view', user);
  platformAlertsNav.hidden = !platformContext || !hasPlatformPermission('alerts', 'view', user);
  platformAuditNav.hidden = !platformContext || !hasPlatformPermission('audit', 'view', user);
  platformSettingsNav.hidden = !platformContext || !hasPlatformPermission('settings', 'view', user);
  platformManualNav.hidden = !platformContext;
  platformNavGroup.hidden = !platformContext;
  platformIntegrationsContent.hidden = !platformContext;
  tenantIntegrationsContent.hidden = platformContext;
  usersViewTitle.textContent = platformContext ? 'Usuários da plataforma' : 'Usuários e permissões';
  usersViewCopy.textContent = platformContext
    ? 'Gerencie as contas administrativas que podem acessar e operar o LogVault.'
    : 'Crie contas individuais e mantenha a trilha de auditoria vinculada a cada pessoa.';
  newUserRole.value = platformContext ? 'admin' : newUserRole.value;
  newUserRole.disabled = platformContext;
  newUserRoleField.hidden = platformContext;
  newUserAccessProfileField.hidden = !platformContext;
  newUserAccessProfile.required = platformContext;
  accessProfilesPanel.hidden = !platformContext;
  userCreatePanel.hidden = platformContext && !hasPlatformPermission('users', 'manage', user);
  addAccessProfileButton.hidden = platformContext && !hasPlatformPermission('users', 'manage', user);
  userAdminsLabel.textContent = platformContext ? 'PERFIS DE ACESSO' : 'ADMINISTRADORES';
  userAdminsDetail.textContent = platformContext ? 'políticas disponíveis' : 'podem gerenciar contas';
  auditNav.hidden = platformContext || !['admin', 'auditor'].includes(user.role);
  capacityNav.hidden = platformContext || !['admin', 'auditor'].includes(user.role);
  capacityLiveTab.hidden = false;
  capacityCalculatorTab.hidden = !platformContext || !hasPlatformPermission('capacity', 'manage', user);
  capacityTechnicalNote.hidden = !platformContext || !hasPlatformPermission('capacity', 'manage', user);
  alertsIntroCopy.textContent = platformContext
    ? 'Acompanhe, em uma única visão, as ocorrências de infraestrutura de todos os clientes ativos.'
    : 'Acompanhe ocorrências de equipamentos, coletores, servidores, processamento e backups.';
  alertsTenantHeading.hidden = !platformContext;
  serversIntroCopy.textContent = platformContext
    ? 'Monitore o servidor principal e os coletores locais de todos os clientes ativos.'
    : 'Monitore os recursos do servidor principal e dos servidores locais que executam coletores.';
  firewallIntroCopy.textContent = platformContext
    ? 'Cadastre manualmente os IPs permitidos para Acesso WEB e SSH, e gerencie separadamente a ingestão dos coletores.'
    : 'Valide as origens que chegam às portas do seu coletor Cloud e controle quais redes podem enviar logs.';
  firewallViewTitle.textContent = platformContext ? 'Firewall e controle de acesso' : 'Firewall de ingestão';
  firewallTabs.hidden = !platformContext;
  selectFirewallTab(platformContext ? 'access' : 'ingestion');
  collectorsViewTitle.textContent = platformContext ? 'Coletores da plataforma' : 'Sincronização da borda';
  collectorsViewCopy.textContent = platformContext
    ? 'Acompanhe conexão, filas e sincronização dos coletores de todos os clientes ativos.'
    : 'Veja a conexão com a nuvem, a fila persistida e o último sincronismo de cada coletor.';
  collectorTotalDetail.textContent = platformContext ? 'cadastrados nos clientes ativos' : 'cadastrados neste ambiente';
  devicesViewTitle.textContent = platformContext ? 'Equipamentos da plataforma' : 'Saúde da coleta';
  devicesViewCopy.textContent = platformContext
    ? 'Acompanhe o recebimento dos equipamentos de todos os clientes ativos.'
    : 'Acompanhe o último pacote recebido e os volumes processados por equipamento.';
  deviceTotalDetail.textContent = platformContext ? 'nos clientes ativos' : 'equipamentos neste ambiente';
  devicePlanLabel.textContent = platformContext ? 'CLIENTES' : 'PLANO';
  tenantContext.hidden = !(user.platformAdmin && user.context === 'tenant');
  tenantContextName.textContent = user.tenant?.name || '';
  environmentLabel.hidden = platformContext;
  if (!platformContext) environmentLabel.lastChild.textContent = ` ${user.tenant?.name || 'Cliente'}`;
  selectCapacityTab('live');
  deviceManagementPanel.hidden = platformContext || user.role !== 'admin';
  discoverDevicesButton.hidden = platformContext || user.role !== 'admin';
  collectorManagementPanel.hidden = platformContext || user.role !== 'admin';
  configureAlertsButton.hidden = platformContext
    ? !hasPlatformPermission('alerts', 'manage', user)
    : user.role !== 'admin';
  clientOnboardingCard.hidden = platformContext && !hasPlatformPermission('clients', 'manage', user);
  planManagementPanel.classList.toggle('read-only', platformContext && !hasPlatformPermission('plans', 'manage', user));
  createPlanForm.hidden = platformContext && !hasPlatformPermission('plans', 'manage', user);
  const settingsCanManage = !platformContext || hasPlatformPermission('settings', 'manage', user);
  platformEmailForm.querySelectorAll('input, select, button').forEach((field) => { field.disabled = !settingsCanManage; });
  platformEmailTestPanel.hidden = platformContext && !settingsCanManage;
  exportPlatformAuditButton.hidden = platformContext && !hasPlatformPermission('audit', 'manage', user);
  if (!platformContext) void loadIntegrationProviderAvailability();
  navigateTo(viewFromLocation(user));
}

function navigateTo(view) {
  const platformContext = isPlatformContext();
  if (platformContext && view !== 'manual' && (!platformViewModules[view] || !hasPlatformPermission(platformViewModules[view], 'view'))) {
    view = firstAllowedPlatformView();
  }
  if (!platformContext && ['clients', 'plans', 'platform-settings', 'continuity', 'manual'].includes(view)) view = 'dashboard';
  if (!platformContext && view === 'integrations' && integrationProviderAvailability === false) view = 'dashboard';
  if (!platformContext && view === 'firewall' && !['admin', 'auditor'].includes(currentUser?.role)) view = 'dashboard';
  platformDashboardView.hidden = view !== 'dashboard' || !platformContext;
  platformAuditView.hidden = view !== 'audit' || !platformContext;
  dashboardView.hidden = view !== 'dashboard' || platformContext;
  queryView.hidden = view !== 'query';
  devicesView.hidden = view !== 'devices';
  collectorsView.hidden = view !== 'collectors';
  firewallView.hidden = view !== 'firewall';
  systemView.hidden = view !== 'system';
  alertsView.hidden = view !== 'alerts';
  serversView.hidden = view !== 'servers';
  continuityView.hidden = view !== 'continuity';
  capacityView.hidden = view !== 'capacity';
  clientsView.hidden = view !== 'clients';
  companyView.hidden = view !== 'company';
  plansView.hidden = view !== 'plans';
  platformSettingsView.hidden = view !== 'platform-settings';
  platformManualView.hidden = view !== 'manual';
  usersView.hidden = view !== 'users';
  auditView.hidden = view !== 'audit' || platformContext;
  integrationsView.hidden = view !== 'integrations';
  pageEyebrow.textContent = view === 'dashboard'
    ? platformContext ? 'Plataforma' : 'Visão geral'
    : view === 'query'
      ? 'Investigação'
      : ['clients', 'plans', 'platform-settings', 'manual'].includes(view) || (['users', 'integrations'].includes(view) && platformContext)
        ? 'Plataforma'
        : view === 'audit' ? platformContext ? 'Plataforma' : 'Administração'
          : ['company', 'integrations', 'users'].includes(view) ? 'Administração' : ['system', 'servers', 'continuity', 'firewall', 'alerts', 'capacity'].includes(view) ? 'Infraestrutura' : 'Operação CGNAT';
  pageTitle.textContent = view === 'devices'
    ? 'Equipamentos'
    : view === 'dashboard' ? 'Dashboard' : view === 'collectors' ? 'Coletores' : view === 'system' ? 'Sistema' : view === 'continuity' ? 'Redundância' : view === 'firewall' ? 'Firewall' : view === 'alerts' ? 'Alertas' : view === 'servers' ? 'Servidores' : view === 'capacity' ? 'Capacidade' : view === 'clients' ? 'Clientes' : view === 'plans' ? 'Planos' : view === 'platform-settings' ? 'Configurações' : view === 'manual' ? 'Manual' : view === 'users' ? 'Usuários' : view === 'company' ? 'Dados da empresa' : view === 'integrations' ? 'Integrações' : view === 'audit' ? 'Auditoria' : 'Consulta CGNAT';
  navLinks.forEach((link) => link.classList.toggle('active', link.dataset.view === view));
  document.body.classList.remove('menu-open');
  menuButton.setAttribute('aria-expanded', 'false');
  if (view === 'dashboard' && platformContext && !platformDashboardLoaded) void loadPlatformDashboard();
  if (view === 'dashboard' && !platformContext && !dashboardLoaded) void loadDashboard();
  if (view === 'devices' && !devicesLoaded) void loadDevices();
  if (view === 'collectors' && !collectorsLoaded) void loadCollectors();
  if (view === 'firewall' && ['admin', 'auditor'].includes(currentUser?.role) && !firewallLoaded) void loadFirewall();
  if (view === 'system') {
    systemLoaded = false;
    void loadSystem();
  }
  if (view === 'alerts') {
    alertsLoaded = false;
    void loadAlerts();
  }
  if (view === 'servers' && !serversLoaded) void loadServers();
  if (view === 'continuity' && !continuityLoaded) void loadContinuity();
  if (view === 'continuity' && !continuityEnrollmentLoaded) void loadContinuityEnrollment();
  if (view === 'capacity' && ['admin', 'auditor'].includes(currentUser?.role)) {
    capacityLoaded = false;
    void loadCapacity();
  }
  if (view === 'users' && currentUser?.role === 'admin' && !usersLoaded) void loadUsers();
  if (view === 'company' && currentUser?.role === 'admin' && !companyProfileLoaded) void loadCompanyProfile();
  if (view === 'integrations' && currentUser?.role === 'admin' && !integrationsLoaded) {
    if (platformContext) void loadPlatformIntegrations();
    else void loadIntegrations();
  }
  if (view === 'query' && !officialReportsLoaded) void loadOfficialReports();
  if (view === 'clients' && platformContext && !clientsLoaded) void loadClients();
  if (view === 'plans' && platformContext && !plansLoaded) void loadPlans();
  if (view === 'platform-settings' && platformContext && !platformEmailLoaded) void loadPlatformEmailSettings();
  if (view === 'audit' && ['admin', 'auditor'].includes(currentUser?.role)) {
    if (platformContext) {
      auditLoaded = false;
      void loadPlatformAudit();
    } else if (!auditLoaded) void loadAudit();
  }
}

async function restoreSession() {
  try {
    const response = await fetch(`${API_BASE}/v1/auth/me`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) return showLogin();
    const payload = await response.json();
    showApplication(payload.user);
  } catch {
    showLogin('Não foi possível conectar ao servidor. Tente novamente.');
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  loginError.hidden = true;
  setButtonLoading(loginButton, true);
  try {
    const response = await fetch(`${API_BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        email: loginForm.email.value.trim(),
        password: loginForm.password.value
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 429
        ? 'Muitas tentativas. Aguarde alguns minutos.'
        : 'E-mail ou senha inválidos.';
      throw new Error(message);
    }
    loginForm.password.value = '';
    showApplication(payload.user);
  } catch (error) {
    loginError.textContent = error instanceof Error ? error.message : 'Falha ao entrar.';
    loginError.hidden = false;
  } finally {
    setButtonLoading(loginButton, false);
  }
});

toggleLoginPasswordButton.addEventListener('click', () => {
  const showingPassword = loginForm.password.type === 'text';
  loginForm.password.type = showingPassword ? 'password' : 'text';
  toggleLoginPasswordButton.setAttribute('aria-pressed', String(!showingPassword));
  toggleLoginPasswordButton.setAttribute('aria-label', showingPassword ? 'Mostrar senha' : 'Ocultar senha');
  toggleLoginPasswordButton.title = showingPassword ? 'Mostrar senha' : 'Ocultar senha';
  loginForm.password.focus();
});

forgotPasswordButton.addEventListener('click', () => {
  passwordRecoveryForm.elements.email.value = loginForm.email.value.trim();
  setLoginFeedback(passwordRecoveryFeedback);
  selectLoginMode('recovery');
  window.setTimeout(() => passwordRecoveryForm.elements.email.focus(), 0);
});

backToLoginButton.addEventListener('click', () => {
  selectLoginMode('login');
  window.setTimeout(() => loginForm.email.focus(), 0);
});

passwordRecoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!passwordRecoveryForm.reportValidity()) return;
  setLoginFeedback(passwordRecoveryFeedback);
  setButtonLoading(passwordRecoveryButton, true);
  try {
    const response = await fetch(`${API_BASE}/v1/auth/password-recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: passwordRecoveryForm.elements.email.value.trim() })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error === 'password_recovery_unavailable'
        ? 'A recuperação por e-mail ainda não está configurada. Procure o administrador da plataforma.'
        : 'Não foi possível solicitar a recuperação agora. Tente novamente.';
      throw new Error(message);
    }
    setLoginFeedback(passwordRecoveryFeedback, 'Se o e-mail estiver cadastrado, o link de recuperação será enviado. Verifique também a caixa de spam.', true);
  } catch (error) {
    setLoginFeedback(passwordRecoveryFeedback, error instanceof Error ? error.message : 'Falha ao solicitar a recuperação.');
  } finally {
    setButtonLoading(passwordRecoveryButton, false);
  }
});

passwordResetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!passwordResetForm.reportValidity()) return;
  setLoginFeedback(passwordResetFeedback);
  const newPassword = passwordResetForm.elements.newPassword.value;
  if (newPassword !== passwordResetForm.elements.confirmation.value) {
    setLoginFeedback(passwordResetFeedback, 'A confirmação não corresponde à nova senha.');
    return;
  }
  setButtonLoading(passwordResetButton, true);
  try {
    const response = await fetch(`${API_BASE}/v1/auth/password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: activePasswordResetToken, newPassword })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error === 'reset_token_invalid_or_expired'
        ? 'Este link é inválido, já foi utilizado ou expirou. Solicite uma nova recuperação.'
        : 'Não foi possível alterar a senha. Revise os dados informados.');
    }
    activePasswordResetToken = '';
    passwordResetForm.reset();
    showLogin('Senha redefinida. Entre com a nova senha.', 'success');
  } catch (error) {
    setLoginFeedback(passwordResetFeedback, error instanceof Error ? error.message : 'Falha ao redefinir a senha.');
  } finally {
    setButtonLoading(passwordResetButton, false);
  }
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await fetch(`${API_BASE}/v1/auth/logout`, { method: 'POST', headers: { Accept: 'application/json' } });
  } finally {
    logoutButton.disabled = false;
    lastQuery = null;
    setExports(false);
    window.location.replace('/');
  }
});

function queryFromForm() {
  const data = new FormData(form);
  const query = new URLSearchParams({
    publicIp: String(data.get('publicIp')).trim(),
    at: String(data.get('at')),
    timezone: String(data.get('timezone')),
    correlateErp: data.get('correlateErp') ? 'true' : 'false'
  });
  const port = String(data.get('port') || '').trim();
  const protocol = String(data.get('protocol') || '').trim();
  if (port) query.set('port', port);
  if (protocol) query.set('protocol', protocol);
  return query;
}

function td(value, label, className = '') {
  const cell = document.createElement('td');
  cell.dataset.label = label;
  cell.textContent = value;
  if (className) cell.className = className;
  return cell;
}

function pillCell(value, label, className) {
  const cell = document.createElement('td');
  cell.dataset.label = label;
  const pill = document.createElement('span');
  pill.className = className;
  pill.textContent = value;
  cell.append(pill);
  return cell;
}

function protocolLabel(row) {
  const known = { 1: 'ICMP', 6: 'TCP', 17: 'UDP' };
  return row.protocolName || known[row.protocol] || String(row.protocol);
}

function eventLabel(row) {
  const known = { allocated: 'Alocado', deallocated: 'Desalocado' };
  const type = known[row.lastEvent] || row.lastEvent;
  const instant = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo'
  }).format(new Date(row.lastEventAt));
  return `${type} · ${instant}`;
}

function subscriberLabel(row, erpStatus) {
  if (row.subscriber?.name) return row.subscriber.name;
  if (row.subscriber?.status === 'ambiguous') return 'Correlação ambígua';
  if (row.subscriber?.status === 'not_found') return 'Não identificado';
  if (erpStatus === 'not_requested') return 'Não consultado';
  if (erpStatus === 'unavailable') return 'Integração indisponível';
  return 'ERP não configurado';
}

function openOfficialReportDialog(row) {
  if (!lastSearchContext?.auditId || !row.lastEventId) return;
  officialReportForm.reset();
  officialReportForm.elements.lastEventId.value = row.lastEventId;
  officialReportSelection.replaceChildren();
  const fields = [
    ['IP público', row.publicIp],
    ['IP privado', row.privateIp],
    ['Protocolo', protocolLabel(row)],
    ['Faixa de portas', `${row.portStart}–${row.portEnd}`]
  ];
  fields.forEach(([label, value]) => {
    const item = document.createElement('div');
    const labelElement = document.createElement('span');
    const valueElement = document.createElement('strong');
    labelElement.textContent = label;
    valueElement.textContent = value;
    item.append(labelElement, valueElement);
    officialReportSelection.append(item);
  });
  setFormFeedback(officialReportFeedback, '');
  officialReportDialog.showModal();
}

function cycleMoment(value) {
  const timezone = lastSearchContext?.searchedTimezone || currentUser?.tenant?.timezone || 'America/Sao_Paulo';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'medium', timeZone: timezone
  }).format(new Date(value));
}

function cycleDurationLabel(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  const parts = [];
  if (days) parts.push(`${days} d`);
  if (hours) parts.push(`${hours} h`);
  if (minutes) parts.push(`${minutes} min`);
  if (!parts.length || remainingSeconds) parts.push(`${remainingSeconds} s`);
  return parts.join(' ');
}

function setAllocationCycleMarker(type) {
  const paths = {
    allocated: '<path d="M4 12h15M15 8l4 4-4 4M20 5v14"/>',
    deallocated: '<path d="M5 5v14M5 12h15M16 8l4 4-4 4"/>',
    open: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  };
  allocationCycleSecondMarker.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[type]}</svg>`;
}

function renderAllocationCycle(cycle) {
  const allocation = cycle.allocation;
  const timezone = lastSearchContext?.searchedTimezone || currentUser?.tenant?.timezone || 'America/Sao_Paulo';
  allocationCycleTimezone.textContent = `Horários exibidos em ${timezone}`;
  allocationCycleSummary.replaceChildren();
  [
    ['IP público', allocation.publicIp],
    ['IP privado', allocation.privateIp],
    ['Protocolo', protocolLabel(allocation)],
    ['Portas', `${allocation.portStart}–${allocation.portEnd}`]
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    const labelElement = document.createElement('span');
    const valueElement = document.createElement('strong');
    labelElement.textContent = label;
    valueElement.textContent = value;
    item.append(labelElement, valueElement);
    allocationCycleSummary.append(item);
  });
  allocationCycleAllocatedAt.textContent = cycleMoment(allocation.eventAt);
  allocationCycleAllocatedReceived.textContent = `Recebido pelo LogVault em ${cycleMoment(allocation.receivedAt)}`;
  allocationCycleStatus.className = `allocation-cycle-status ${cycle.status}`;
  allocationCycleSecondEvent.className = 'allocation-cycle-event';

  if (cycle.status === 'closed') {
    const deallocation = cycle.deallocation;
    allocationCycleStatusTitle.textContent = 'Ciclo completo';
    allocationCycleStatusCopy.textContent = 'Foi localizada a desalocação explícita correspondente a este registro.';
    allocationCycleDuration.textContent = `Duração: ${cycleDurationLabel(cycle.durationSeconds)}`;
    allocationCycleSecondEvent.classList.add('deallocated');
    setAllocationCycleMarker('deallocated');
    allocationCycleSecondLabel.textContent = 'DESALOCAÇÃO RECEBIDA';
    allocationCycleSecondAt.textContent = cycleMoment(deallocation.eventAt);
    allocationCycleSecondReceived.textContent = `Recebido pelo LogVault em ${cycleMoment(deallocation.receivedAt)}`;
    allocationCycleNote.textContent = 'O pareamento foi feito pela mesma tradução, no mesmo equipamento, respeitando a ordem original dos eventos.';
    return;
  }

  if (cycle.status === 'ambiguous') {
    const conflict = cycle.conflictingAllocation;
    allocationCycleStatusTitle.textContent = 'Ciclo sem pareamento seguro';
    allocationCycleStatusCopy.textContent = 'Outra alocação igual apareceu antes de uma desalocação. O LogVault não presumiu o encerramento deste ciclo.';
    allocationCycleDuration.textContent = 'Duração não determinada';
    allocationCycleSecondEvent.classList.add('ambiguous');
    setAllocationCycleMarker('allocated');
    allocationCycleSecondLabel.textContent = 'NOVA ALOCAÇÃO ENCONTRADA';
    allocationCycleSecondAt.textContent = cycleMoment(conflict.eventAt);
    allocationCycleSecondReceived.textContent = `Recebido pelo LogVault em ${cycleMoment(conflict.receivedAt)}`;
    allocationCycleNote.textContent = 'Este resultado é sinalizado para análise justamente para evitar associar eventos que talvez pertençam a ciclos diferentes.';
    return;
  }

  allocationCycleStatusTitle.textContent = 'Alocação sem desalocação recebida';
  allocationCycleStatusCopy.textContent = 'Até o fim da retenção disponível, não existe um evento explícito encerrando esta alocação.';
  allocationCycleDuration.textContent = 'Ciclo em aberto';
  allocationCycleSecondEvent.classList.add('open');
  setAllocationCycleMarker('open');
  allocationCycleSecondLabel.textContent = 'DESALOCAÇÃO NÃO RECEBIDA';
  allocationCycleSecondAt.textContent = 'Sem horário de encerramento';
  allocationCycleSecondReceived.textContent = 'O LogVault não cria eventos ausentes.';
  allocationCycleNote.textContent = 'Isso pode indicar uma alocação ainda ativa ou uma desalocação que não foi recebida.';
}

async function openAllocationCycleDialog(row) {
  if (!row.lastEventId) return;
  allocationCycleLoading.hidden = false;
  allocationCycleError.hidden = true;
  allocationCycleResult.hidden = true;
  allocationCycleTimezone.textContent = 'Consultando os eventos armazenados';
  allocationCycleDialog.showModal();
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/cgnat/events/${encodeURIComponent(row.lastEventId)}/cycle`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error === 'allocation_event_not_found'
        ? 'A alocação selecionada não está mais disponível na retenção.'
        : 'O serviço não conseguiu localizar o ciclo deste registro.');
    }
    renderAllocationCycle(payload.cycle);
    allocationCycleLoading.hidden = true;
    allocationCycleResult.hidden = false;
  } catch (error) {
    allocationCycleLoading.hidden = true;
    allocationCycleError.hidden = false;
    allocationCycleErrorMessage.textContent = error instanceof Error ? error.message : 'Tente novamente.';
  }
}

function renderRows(rows, erpStatus) {
  resultBody.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    const actions = document.createElement('td');
    actions.dataset.label = 'Ações';
    actions.className = 'search-row-actions';
    const cycleButton = document.createElement('button');
    cycleButton.type = 'button';
    cycleButton.className = 'table-action cycle-action';
    cycleButton.textContent = 'Ver ciclo';
    cycleButton.disabled = !row.lastEventId;
    cycleButton.title = row.lastEventId ? 'Ver a alocação e sua desalocação correspondente' : 'Registro sem identificador de evento';
    cycleButton.addEventListener('click', () => openAllocationCycleDialog(row));
    const reportButton = document.createElement('button');
    reportButton.type = 'button';
    reportButton.className = 'table-action';
    reportButton.textContent = 'Relatório para ofício';
    reportButton.disabled = !row.lastEventId;
    reportButton.title = row.lastEventId ? 'Gerar documento oficial a partir deste registro' : 'Registro sem identificador de evento';
    reportButton.addEventListener('click', () => openOfficialReportDialog(row));
    actions.append(cycleButton, reportButton);
    tr.append(
      td(row.publicIp, 'IP Público', 'ip-value'),
      td(row.privateIp, 'IP Privado', 'ip-value'),
      pillCell(protocolLabel(row), 'Protocolo', 'protocol-pill'),
      td(String(row.portStart), 'Porta Início'),
      td(String(row.portEnd), 'Porta Fim'),
      pillCell(eventLabel(row), 'Último Evento', 'event-pill'),
      td(subscriberLabel(row, erpStatus), 'Assinante ERP', 'erp-muted'),
      actions
    );
    resultBody.append(tr);
  }
}

function showError(message) {
  emptyState.hidden = true;
  tableWrap.hidden = true;
  errorState.hidden = false;
  errorMessage.textContent = message;
  resultTitle.textContent = 'Falha na consulta';
  auditLine.textContent = 'Nenhum resultado foi alterado.';
  setExports(false);
}

async function authenticatedFetch(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    showLogin('Sua sessão expirou. Entre novamente.');
    throw new Error('Sessão expirada.');
  }
  return response;
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatDeviceMoment(value) {
  if (!value) return 'Nenhum pacote recebido';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo'
  }).format(new Date(value));
}

function resetOperationalCaches() {
  dashboardLoaded = false;
  devicesLoaded = false;
  collectorsLoaded = false;
  firewallLoaded = false;
  systemLoaded = false;
  alertsLoaded = false;
  serversLoaded = false;
  capacityLoaded = false;
  usersLoaded = false;
  auditLoaded = false;
  companyProfileLoaded = false;
  officialReportsLoaded = false;
  integrationsLoaded = false;
  integrationTargetsLoaded = false;
  lastQuery = null;
  lastSearchContext = null;
  setExports(false);
}

async function changeTenantContext(tenantId, triggerButton = null) {
  if (triggerButton) triggerButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/auth/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ tenantId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error === 'tenant_not_found'
        ? 'Este cliente está inativo ou não está mais disponível.'
        : 'Não foi possível alterar o ambiente de trabalho.');
    }
    const sessionResponse = await authenticatedFetch(`${API_BASE}/v1/auth/me`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const sessionPayload = await sessionResponse.json().catch(() => ({}));
    if (!sessionResponse.ok || !sessionPayload.user) throw new Error('A nova sessão não pôde ser carregada.');
    resetOperationalCaches();
    platformDashboardLoaded = false;
    clientsLoaded = false;
    if (triggerButton) triggerButton.disabled = false;
    window.history.pushState(null, '', '#dashboard');
    showApplication(sessionPayload.user);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao alterar o ambiente.');
    if (triggerButton) triggerButton.disabled = false;
  }
}

function formatRelativeMoment(value) {
  if (!value) return 'Sem recebimento';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Sem recebimento';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Há ${days} dia${days === 1 ? '' : 's'}`;
  return formatDeviceMoment(value);
}

function renderPlatformVolumeChart(points, period) {
  platformDashboardVolumeChart.replaceChildren();
  const maximum = Math.max(1, ...points.flatMap((point) => [point.rawRecords, point.totalEvents]));
  points.forEach((point, index) => {
    const column = document.createElement('div');
    column.className = 'platform-chart-column';
    const bars = document.createElement('div');
    bars.className = 'platform-chart-bars';
    const raw = document.createElement('i');
    raw.className = 'raw';
    raw.style.height = point.rawRecords > 0 ? `${Math.max(3, point.rawRecords / maximum * 100)}%` : '0';
    raw.title = `${formatDeviceMoment(point.bucket)} · ${formatNumber(point.rawRecords)} registros recebidos`;
    const events = document.createElement('i');
    events.className = 'events';
    events.style.height = point.totalEvents > 0 ? `${Math.max(3, point.totalEvents / maximum * 100)}%` : '0';
    events.title = `${formatDeviceMoment(point.bucket)} · ${formatNumber(point.totalEvents)} eventos normalizados`;
    bars.append(raw, events);
    const label = document.createElement('small');
    const moment = new Date(point.bucket);
    const showLabel = period !== '30d' || index % 3 === 0 || index === points.length - 1;
    label.textContent = showLabel
      ? period === '24h'
        ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', timeZone: 'America/Sao_Paulo' }).format(moment)
        : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(moment)
      : '';
    column.append(bars, label);
    platformDashboardVolumeChart.append(column);
  });
}

function renderPlatformStorage(tenants) {
  platformDashboardStorageList.replaceChildren();
  const measured = tenants.filter((tenant) => tenant.estimatedCurrentBytes > 0).slice(0, 6);
  if (measured.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'platform-storage-empty';
    empty.textContent = 'O consumo aparecerá quando os clientes começarem a enviar logs.';
    platformDashboardStorageList.append(empty);
    return;
  }
  const maximum = Math.max(...measured.map((tenant) => tenant.estimatedCurrentBytes), 1);
  for (const tenant of measured) {
    const row = document.createElement('div');
    row.className = 'platform-storage-row';
    const head = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = tenant.name;
    const value = document.createElement('span');
    value.textContent = formatBytes(tenant.estimatedCurrentBytes);
    head.append(name, value);
    const track = document.createElement('i');
    const bar = document.createElement('b');
    bar.style.width = `${Math.max(2, tenant.estimatedCurrentBytes / maximum * 100)}%`;
    track.append(bar);
    row.append(head, track);
    platformDashboardStorageList.append(row);
  }
}

function platformAttentionSourceIcon(source) {
  const icon = document.createElement('span');
  icon.className = 'platform-attention-source-icon';
  const svg = svgNode('svg', { 'aria-hidden': 'true' });
  const symbol = {
    collector: '#icon-server',
    device: '#icon-hard-drive',
    parser: '#icon-activity',
    spool: '#icon-database-backup',
    backup: '#icon-database-backup',
    server: '#icon-server'
  }[source] || '#icon-bell';
  svg.append(svgNode('use', { href: symbol }));
  icon.append(svg);
  return icon;
}

function renderPlatformAttention(alerts, tenants) {
  platformDashboardAttentionList.replaceChildren();
  if (alerts.length === 0) {
    const healthy = document.createElement('div');
    healthy.className = 'platform-attention-empty';
    healthy.innerHTML = '<span>✓</span><div><strong>Nenhuma ocorrência em aberto</strong><small>Todos os itens monitorados estão dentro dos parâmetros esperados.</small></div>';
    platformDashboardAttentionList.append(healthy);
    return;
  }

  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const groupsByTenant = new Map();
  for (const alert of alerts) {
    const key = alert.tenantId || 'platform';
    const group = groupsByTenant.get(key) || {
      id: alert.tenantId || null,
      name: alert.tenantName || 'Plataforma',
      alerts: []
    };
    group.alerts.push(alert);
    groupsByTenant.set(key, group);
  }

  const groups = Array.from(groupsByTenant.values())
    .sort((left, right) => {
      const leftCritical = left.alerts.some((alert) => alert.severity === 'critical');
      const rightCritical = right.alerts.some((alert) => alert.severity === 'critical');
      return Number(rightCritical) - Number(leftCritical)
        || right.alerts.length - left.alerts.length
        || left.name.localeCompare(right.name, 'pt-BR');
    })
    .slice(0, 6);

  for (const group of groups) {
    const tenantData = group.id ? tenantById.get(group.id) : null;
    const criticalCount = group.alerts.filter((alert) => alert.severity === 'critical').length;
    const highestSeverity = criticalCount > 0 ? 'critical' : 'warning';
    const item = document.createElement('div');
    item.className = `platform-attention-item ${highestSeverity}`;

    const head = document.createElement('div');
    head.className = 'platform-attention-item-head';

    const client = document.createElement('div');
    client.className = 'platform-attention-client';
    const avatar = document.createElement('span');
    avatar.className = `platform-attention-avatar ${highestSeverity}`;
    avatar.textContent = group.name.trim().charAt(0).toUpperCase() || 'A';
    if (tenantData?.logoConfigured) {
      const logo = document.createElement('img');
      logo.alt = '';
      logo.src = `${API_BASE}/v1/platform/tenants/${encodeURIComponent(tenantData.id)}/company-profile/logo?v=${Date.now()}`;
      logo.addEventListener('error', () => {
        avatar.classList.remove('has-logo');
        logo.remove();
      }, { once: true });
      avatar.classList.add('has-logo');
      avatar.append(logo);
    }
    const identity = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = group.name;
    const context = document.createElement('span');
    context.textContent = tenantData
      ? `${formatNumber(tenantData.enabledDeviceCount)} equipamento${tenantData.enabledDeviceCount === 1 ? '' : 's'} · ${tenantData.enabledCollectorCount > 0
        ? `${formatNumber(tenantData.connectedCollectorCount)} de ${formatNumber(tenantData.enabledCollectorCount)} coletor${tenantData.enabledCollectorCount === 1 ? '' : 'es'} online`
        : 'nenhum coletor configurado'}`
      : 'Infraestrutura central do LogVault';
    identity.append(name, context);
    client.append(avatar, identity);

    const summary = document.createElement('div');
    summary.className = 'platform-attention-summary';
    const severity = document.createElement('span');
    severity.className = `platform-attention-severity ${highestSeverity}`;
    severity.textContent = highestSeverity === 'critical' ? 'Crítico' : 'Aviso';
    const count = document.createElement('strong');
    count.textContent = `${formatNumber(group.alerts.length)} ocorrência${group.alerts.length === 1 ? '' : 's'} em aberto`;
    summary.append(severity, count);
    head.append(client, summary);

    const issueList = document.createElement('div');
    issueList.className = 'platform-attention-issues';
    for (const alert of group.alerts.slice(0, 3)) {
      const issue = document.createElement('div');
      issue.className = 'platform-attention-issue';
      issue.append(platformAttentionSourceIcon(alert.source));
      const content = document.createElement('div');
      content.className = 'platform-attention-issue-content';
      const source = document.createElement('span');
      source.className = 'platform-attention-source';
      source.textContent = alertSourceLabel(alert.source);
      const title = document.createElement('strong');
      title.textContent = alert.title;
      const detail = document.createElement('small');
      detail.textContent = alert.detail;
      content.append(source, title, detail);
      issue.append(content);
      issueList.append(issue);
    }
    if (group.alerts.length > 3) {
      const remaining = document.createElement('small');
      remaining.className = 'platform-attention-remaining';
      remaining.textContent = `+ ${formatNumber(group.alerts.length - 3)} outra(s) ocorrência(s)`;
      issueList.append(remaining);
    }

    item.append(head, issueList);
    platformDashboardAttentionList.append(item);
  }
}

function setPlatformResource(valueElement, barElement, value) {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  valueElement.textContent = normalized === null ? 'Coletando' : `${normalized.toFixed(1).replace('.', ',')}%`;
  barElement.style.width = normalized === null ? '0' : `${normalized}%`;
  barElement.className = normalized !== null && normalized >= 95 ? 'critical' : normalized !== null && normalized >= 80 ? 'warning' : '';
}

async function loadPlatformDashboard() {
  platformDashboardLoading.hidden = false;
  platformDashboardError.hidden = true;
  refreshPlatformDashboardButton.disabled = true;
  platformDashboardPeriod.disabled = true;
  try {
    const period = platformDashboardPeriod.value;
    const requests = [
      `${API_BASE}/v1/dashboard?period=${encodeURIComponent(period)}`,
      `${API_BASE}/v1/system/status`,
      `${API_BASE}/v1/servers/status`,
      `${API_BASE}/v1/capacity`
    ].map((url) => authenticatedFetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' }));
    const responses = await Promise.all(requests);
    if (responses.some((response) => !response.ok)) {
      throw new Error('Os indicadores operacionais não responderam corretamente.');
    }
    const [dashboard, system, servers, capacity] = await Promise.all(responses.map((response) => response.json()));
    const criticalAlerts = system.alerts.filter((alert) => alert.severity === 'critical').length;
    const warningAlerts = system.alerts.filter((alert) => alert.severity === 'warning').length;
    platformDashboardActiveClients.textContent = formatNumber(dashboard.summary.activeClients);
    platformDashboardClientTotal.textContent = `${formatNumber(dashboard.summary.clients - dashboard.summary.activeClients)} inativo(s) · ${formatNumber(dashboard.summary.clients)} no total`;
    platformDashboardCollectors.textContent = `${formatNumber(dashboard.summary.connectedCollectors)}/${formatNumber(dashboard.summary.collectors)}`;
    platformDashboardCollectorsDetail.textContent = dashboard.summary.collectors ? 'coletores conectados' : 'nenhum coletor configurado';
    platformDashboardDevices.textContent = `${formatNumber(dashboard.summary.receivingDevices)}/${formatNumber(dashboard.summary.devices)}`;
    platformDashboardDevicesDetail.textContent = dashboard.summary.devices ? 'equipamentos recebendo' : 'nenhum equipamento configurado';
    platformDashboardAlerts.textContent = formatNumber(system.alerts.length);
    platformDashboardAlerts.className = criticalAlerts ? 'summary-critical' : warningAlerts ? 'summary-warning' : 'summary-good';
    platformDashboardAlertsDetail.textContent = `${formatNumber(criticalAlerts)} crítico(s) · ${formatNumber(warningAlerts)} aviso(s)`;
    platformDashboardRawRecords.textContent = formatNumber(dashboard.summary.rawRecords);
    platformDashboardEvents.textContent = formatNumber(dashboard.summary.totalEvents);
    platformDashboardRate.textContent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(dashboard.summary.eventsPerSecond5m);
    platformDashboardLastLog.textContent = formatRelativeMoment(dashboard.summary.lastReceivedAt);
    platformDashboardLastLog.title = dashboard.summary.lastReceivedAt ? formatDeviceMoment(dashboard.summary.lastReceivedAt) : '';
    platformDashboardParseFailures.textContent = formatNumber(dashboard.summary.parseFailures);
    platformDashboardParseFailures.className = dashboard.summary.parseFailures ? 'metric-warning' : '';
    platformDashboardQueue.textContent = formatNumber(capacity.spool.pendingRecords);
    platformDashboardQueue.className = capacity.spool.pendingRecords ? 'metric-warning' : '';
    platformDashboardStorage.textContent = formatBytes(capacity.storage.instancePhysicalBytes);
    platformDashboardBackup.textContent = system.backup?.latest
      ? formatDeviceMoment(system.backup.latest.createdAt)
      : 'Nenhum concluído';
    platformDashboardGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(dashboard.generatedAt)}`;

    const primaryServer = servers.servers.find((server) => server.id === 'cloud-primary');
    const serverStatus = primaryServer?.status || 'collecting';
    const statusLabels = { healthy: 'Saudável', warning: 'Atenção', critical: 'Crítico', offline: 'Offline', collecting: 'Coletando', disabled: 'Desativado' };
    platformDashboardServerStatus.textContent = statusLabels[serverStatus] || 'Coletando';
    platformDashboardServerStatus.className = `platform-health-status ${serverStatus}`;
    setPlatformResource(platformDashboardCpu, platformDashboardCpuBar, primaryServer?.cpu.usagePercent ?? null);
    setPlatformResource(platformDashboardMemory, platformDashboardMemoryBar, primaryServer?.memory.usagePercent ?? null);
    setPlatformResource(platformDashboardStoragePercent, platformDashboardStorageBar, primaryServer?.storage.usagePercent ?? null);
    renderPlatformVolumeChart(dashboard.timeline, period);
    renderPlatformStorage(capacity.tenants || []);
    renderPlatformAttention(system.alerts, dashboard.tenants);
    platformDashboardLoading.hidden = true;
    platformDashboardLoaded = true;
  } catch (error) {
    platformDashboardLoading.hidden = true;
    if (!appShell.hidden) {
      platformDashboardError.hidden = false;
      platformDashboardErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshPlatformDashboardButton.disabled = false;
    platformDashboardPeriod.disabled = false;
  }
}

function renderDashboardHighlight(highlight, ipElement, detailElement) {
  ipElement.textContent = highlight?.ip || 'Sem dados';
  detailElement.textContent = highlight
    ? `${formatNumber(highlight.eventCount)} evento(s) no período`
    : 'Sem eventos no período';
}

function dashboardBucketLabel(bucket, period) {
  const date = new Date(bucket);
  return period === '24h'
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date)
    : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(date);
}

function renderDashboardTimeline(points, period) {
  dashboardChart.replaceChildren();
  const maximum = Math.max(1, ...points.flatMap((point) => [point.allocations, point.deallocations]));
  const labelInterval = Math.max(1, Math.ceil(points.length / 10));
  points.forEach((point, index) => {
    const column = document.createElement('div');
    column.className = 'dashboard-chart-column';
    const bars = document.createElement('div');
    bars.className = 'dashboard-chart-bars';
    const allocated = document.createElement('div');
    allocated.className = 'dashboard-chart-bar allocated';
    allocated.style.height = `${point.allocations === 0 ? 0 : Math.max(3, (point.allocations / maximum) * 100)}%`;
    allocated.title = `${dashboardBucketLabel(point.bucket, period)} · ${formatNumber(point.allocations)} alocação(ões)`;
    const deallocated = document.createElement('div');
    deallocated.className = 'dashboard-chart-bar deallocated';
    deallocated.style.height = `${point.deallocations === 0 ? 0 : Math.max(3, (point.deallocations / maximum) * 100)}%`;
    deallocated.title = `${dashboardBucketLabel(point.bucket, period)} · ${formatNumber(point.deallocations)} desalocação(ões)`;
    bars.append(allocated, deallocated);
    const label = document.createElement('span');
    label.className = 'dashboard-chart-label';
    label.textContent = index % labelInterval === 0 || index === points.length - 1
      ? dashboardBucketLabel(point.bucket, period)
      : '';
    column.append(bars, label);
    dashboardChart.append(column);
  });
}

async function loadDashboard() {
  dashboardLoading.hidden = false;
  dashboardError.hidden = true;
  dashboardEmpty.hidden = true;
  dashboardChartWrap.hidden = true;
  refreshDashboardButton.disabled = true;
  dashboardPeriod.disabled = true;
  try {
    const period = dashboardPeriod.value;
    const response = await authenticatedFetch(`${API_BASE}/v1/dashboard?period=${encodeURIComponent(period)}`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('O serviço de indicadores não respondeu corretamente.');
    dashboardEvents.textContent = formatNumber(payload.summary.totalEvents);
    dashboardRawRecords.textContent = `${formatNumber(payload.summary.rawRecords)} registro(s) bruto(s) recebido(s)`;
    dashboardAllocations.textContent = formatNumber(payload.summary.allocations);
    dashboardDeallocations.textContent = formatNumber(payload.summary.deallocations);
    dashboardPublicIps.textContent = formatNumber(payload.summary.publicIps);
    dashboardPrivateIps.textContent = `${formatNumber(payload.summary.privateIps)} IP(s) privado(s)`;
    renderDashboardHighlight(payload.highlights.publicMostAllocated, dashboardPublicAllocatedIp, dashboardPublicAllocatedDetail);
    renderDashboardHighlight(payload.highlights.publicMostDeallocated, dashboardPublicDeallocatedIp, dashboardPublicDeallocatedDetail);
    renderDashboardHighlight(payload.highlights.privateMostAllocated, dashboardPrivateAllocatedIp, dashboardPrivateAllocatedDetail);
    dashboardLastEvent.textContent = payload.summary.lastEventAt ? formatDeviceMoment(payload.summary.lastEventAt) : 'Sem eventos';
    dashboardGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    renderDashboardTimeline(payload.timeline, payload.period);
    const empty = payload.summary.totalEvents === 0;
    dashboardLoading.hidden = true;
    dashboardEmpty.hidden = !empty;
    dashboardChartWrap.hidden = empty;
    dashboardLoaded = true;
  } catch (error) {
    dashboardLoading.hidden = true;
    if (!appShell.hidden) {
      dashboardError.hidden = false;
      dashboardErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshDashboardButton.disabled = false;
    dashboardPeriod.disabled = false;
  }
}

function statusPresentation(status) {
  const presentations = {
    receiving: { label: 'Recebendo', detail: 'pacote em até 5 minutos' },
    delayed: { label: 'Atrasado', detail: 'sem pacote há mais de 5 minutos' },
    offline: { label: 'Sem recebimento', detail: 'sem pacote há mais de 1 hora' },
    never: { label: 'Nunca recebido', detail: 'nenhum registro armazenado' },
    disabled: { label: 'Desabilitado', detail: 'equipamento inativo no cadastro' }
  };
  return presentations[status] || { label: status, detail: 'estado desconhecido' };
}

function metric(label, value, className = '') {
  const wrapper = document.createElement('div');
  const name = document.createElement('span');
  const amount = document.createElement('strong');
  name.textContent = label;
  amount.textContent = value;
  if (className) amount.className = className;
  wrapper.append(name, amount);
  return wrapper;
}

function populateCollectorSelect(select, selectedId = '') {
  select.replaceChildren();
  for (const collector of availableCollectors) {
    const option = document.createElement('option');
    option.value = collector.id;
    option.textContent = collector.name;
    option.selected = collector.id === selectedId;
    select.append(option);
  }
}

function discoveryCountdownLabel(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function resetDiscoveryDialog() {
  if (discoveryPollTimer) window.clearTimeout(discoveryPollTimer);
  discoveryPollTimer = null;
  currentDiscoverySession = null;
  populateCollectorSelect(deviceDiscoveryCollector);
  deviceDiscoveryForm.hidden = false;
  deviceDiscoveryProgress.hidden = true;
  deviceDiscoveryResults.hidden = true;
  deviceDiscoveryCandidates.replaceChildren();
  setFormFeedback(deviceDiscoveryFeedback, '');
  setButtonLoading(startDeviceDiscoveryButton, false);
  startDeviceDiscoveryButton.querySelector('.button-label').textContent = 'Iniciar por 2 minutos';
}

function useDiscoveryCandidate(candidate) {
  createDeviceForm.name.value = candidate.suggestedName;
  createDeviceForm.vendor.value = candidate.vendor;
  createDeviceForm.exporterIp.value = candidate.exporterIp;
  populateCollectorSelect(createDeviceForm.collectorId, currentDiscoverySession?.collectorId || '');
  setFormFeedback(createDeviceFeedback, 'Sugestão preenchida. Revise os dados e confirme o cadastro manualmente.');
  if (discoveryPollTimer) window.clearTimeout(discoveryPollTimer);
  discoveryPollTimer = null;
  deviceDiscoveryDialog.close();
  createDeviceForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => createDeviceForm.name.focus(), 250);
}

function renderDiscoveryCandidates(candidates) {
  deviceDiscoveryCandidates.replaceChildren();
  deviceDiscoverySummary.textContent = candidates.length === 1
    ? '1 equipamento novo'
    : `${formatNumber(candidates.length)} equipamentos novos`;
  if (!candidates.length) {
    const empty = document.createElement('p');
    empty.className = 'discovery-empty';
    empty.textContent = 'Nenhum equipamento novo enviou um log válido durante esta janela.';
    deviceDiscoveryCandidates.append(empty);
    return;
  }
  for (const candidate of candidates) {
    const card = document.createElement('article');
    card.className = 'discovery-candidate';
    const identity = document.createElement('div');
    const name = document.createElement('strong');
    const detail = document.createElement('small');
    name.textContent = candidate.suggestedName;
    detail.textContent = `${candidate.vendor.toUpperCase()} · ${candidate.sourceType === 'syslog' ? 'Syslog' : 'NetFlow v9'} · ${formatNumber(candidate.recordCount)} registros`;
    identity.append(name, detail);
    const address = document.createElement('div');
    address.className = 'discovery-candidate-ip';
    address.textContent = candidate.exporterIp;
    if (candidate.transportIp) {
      const transport = document.createElement('small');
      transport.textContent = `Transporte: ${candidate.transportIp}`;
      address.append(transport);
    }
    const use = document.createElement('button');
    use.type = 'button';
    use.className = 'table-action activate';
    use.textContent = 'Usar sugestão';
    use.addEventListener('click', () => useDiscoveryCandidate(candidate));
    card.append(identity, address, use);
    deviceDiscoveryCandidates.append(card);
  }
}

async function pollDeviceDiscovery(discoveryId) {
  if (!deviceDiscoveryDialog.open) return;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/devices/discovery/${discoveryId}`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404) window.sessionStorage.removeItem(discoveryStorageKey);
      throw new Error('Não foi possível acompanhar esta sessão de discovery.');
    }
    currentDiscoverySession = payload.session;
    deviceDiscoveryCollectorName.textContent = payload.session.collectorName;
    if (payload.status === 'running') {
      const totalSeconds = Math.max(1, (Date.parse(payload.session.endsAt) - Date.parse(payload.session.startedAt)) / 1000);
      const elapsedPercent = Math.min(100, Math.max(0, (totalSeconds - payload.remainingSeconds) / totalSeconds * 100));
      deviceDiscoveryForm.hidden = true;
      deviceDiscoveryResults.hidden = true;
      deviceDiscoveryProgress.hidden = false;
      deviceDiscoveryCountdown.textContent = discoveryCountdownLabel(payload.remainingSeconds);
      deviceDiscoveryProgressBar.style.width = `${elapsedPercent}%`;
      discoveryPollTimer = window.setTimeout(() => void pollDeviceDiscovery(discoveryId), 1000);
      return;
    }
    deviceDiscoveryProgress.hidden = true;
    deviceDiscoveryResults.hidden = false;
    deviceDiscoveryForm.hidden = false;
    startDeviceDiscoveryButton.querySelector('.button-label').textContent = 'Iniciar nova análise';
    populateCollectorSelect(deviceDiscoveryCollector, payload.session.collectorId);
    renderDiscoveryCandidates(payload.candidates || []);
    setFormFeedback(deviceDiscoveryFeedback, 'Análise concluída. Use uma sugestão ou inicie uma nova janela.');
  } catch (error) {
    deviceDiscoveryProgress.hidden = true;
    deviceDiscoveryForm.hidden = false;
    setFormFeedback(deviceDiscoveryFeedback, error instanceof Error ? error.message : 'Falha no discovery.', true);
  }
}

function openDeviceDiscovery() {
  resetDiscoveryDialog();
  deviceDiscoveryDialog.showModal();
  const storedSessionId = window.sessionStorage.getItem(discoveryStorageKey);
  if (storedSessionId) void pollDeviceDiscovery(storedSessionId);
}

discoverDevicesButton.addEventListener('click', openDeviceDiscovery);
closeDeviceDiscoveryButton.addEventListener('click', () => {
  if (discoveryPollTimer) window.clearTimeout(discoveryPollTimer);
  discoveryPollTimer = null;
  deviceDiscoveryDialog.close();
});

deviceDiscoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!deviceDiscoveryForm.reportValidity()) return;
  setButtonLoading(startDeviceDiscoveryButton, true);
  setFormFeedback(deviceDiscoveryFeedback, '');
  deviceDiscoveryResults.hidden = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/devices/discovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ collectorId: deviceDiscoveryCollector.value })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && payload.error !== 'discovery_already_running') {
      throw new Error(payload.error === 'collector_not_found'
        ? 'O coletor selecionado não está disponível.'
        : 'Não foi possível iniciar o discovery.');
    }
    const discoverySession = payload.session;
    window.sessionStorage.setItem(discoveryStorageKey, discoverySession.id);
    currentDiscoverySession = discoverySession;
    deviceDiscoveryForm.hidden = true;
    deviceDiscoveryProgress.hidden = false;
    await pollDeviceDiscovery(discoverySession.id);
  } catch (error) {
    setFormFeedback(deviceDiscoveryFeedback, error instanceof Error ? error.message : 'Falha ao iniciar discovery.', true);
  } finally {
    setButtonLoading(startDeviceDiscoveryButton, false);
  }
});

function openDeviceEditor(device) {
  editDeviceForm.deviceId.value = device.id;
  editDeviceForm.name.value = device.name;
  editDeviceForm.vendor.value = device.vendor;
  editDeviceForm.exporterIp.value = device.exporterIp;
  populateCollectorSelect(editDeviceForm.collectorId, device.collectorId || '');
  editDeviceForm.enabled.checked = device.enabled;
  setFormFeedback(editDeviceFeedback, '');
  deviceDialog.showModal();
}

async function saveDevice(deviceId, payload) {
  const response = await authenticatedFetch(`${API_BASE}/v1/devices/${deviceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.error === 'exporter_ip_already_exists'
      ? 'Este IP de origem já pertence a outro equipamento.'
      : 'Revise os dados do equipamento.';
    throw new Error(message);
  }
  return body.device;
}

function renderDevices(devices) {
  deviceList.replaceChildren();
  for (const device of devices) {
    const card = document.createElement('article');
    card.className = 'device-card';

    const identity = document.createElement('div');
    identity.className = 'device-identity';
    const vendor = document.createElement('span');
    vendor.className = 'vendor-badge';
    const vendorName = device.vendor === 'a10' ? 'A10 Networks' : device.vendor === 'cisco' ? 'Cisco' : String(device.vendor).toUpperCase();
    const vendorAsset = device.vendor === 'a10' ? '/assets/vendors/a10.png' : device.vendor === 'cisco' ? '/assets/vendors/cisco.svg' : '';
    if (vendorAsset) {
      const vendorLogo = document.createElement('img');
      vendorLogo.src = vendorAsset;
      vendorLogo.alt = vendorName;
      vendor.append(vendorLogo);
    } else {
      vendor.textContent = vendorName;
    }
    const identityCopy = document.createElement('div');
    const name = document.createElement('strong');
    const address = document.createElement('small');
    name.textContent = device.name;
    address.textContent = device.tenantName
      ? `${device.tenantName} · ${device.collectorName || 'Sem coletor'} · ${device.exporterIp}`
      : device.exporterIp;
    identityCopy.append(name, address);
    identity.append(vendor, identityCopy);

    const state = document.createElement('div');
    state.className = `device-state ${device.status}`;
    const stateDot = document.createElement('span');
    const stateCopy = document.createElement('div');
    const stateName = document.createElement('strong');
    const stateDetail = document.createElement('small');
    const presentation = statusPresentation(device.status);
    stateName.textContent = presentation.label;
    stateDetail.textContent = presentation.detail;
    stateCopy.append(stateName, stateDetail);
    state.append(stateDot, stateCopy);

    const metrics = document.createElement('div');
    metrics.className = 'device-metrics';
    metrics.append(
      metric('Último pacote', formatDeviceMoment(device.lastReceivedAt)),
      metric('Eventos em 24h', formatNumber(device.events24h)),
      metric('Falhas em 24h', formatNumber(device.parseFailures24h), device.parseFailures24h ? 'metric-error' : '')
    );
    card.append(identity, state, metrics);
    if (currentUser?.role === 'admin' && !isPlatformContext()) {
      const actions = document.createElement('div');
      actions.className = 'device-admin-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'table-action';
      edit.textContent = 'Editar';
      edit.addEventListener('click', () => openDeviceEditor(device));
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = `table-action ${device.enabled ? 'deactivate' : 'activate'}`;
      toggle.textContent = device.enabled ? 'Desativar' : 'Ativar';
      toggle.addEventListener('click', async () => {
        edit.disabled = true;
        toggle.disabled = true;
        try {
          await saveDevice(device.id, {
            collectorId: device.collectorId,
            name: device.name,
            vendor: device.vendor,
            exporterIp: device.exporterIp,
            timezone: device.timezone,
            enabled: !device.enabled
          });
          devicesLoaded = false;
          await loadDevices();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Falha ao atualizar equipamento.');
          edit.disabled = false;
          toggle.disabled = false;
        }
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'table-action danger';
      remove.textContent = 'Excluir';
      remove.addEventListener('click', async () => {
        const confirmed = window.confirm(`Excluir ${device.name}? Ele será removido do coletor, mas os logs e a auditoria histórica serão preservados.`);
        if (!confirmed) return;
        edit.disabled = true;
        toggle.disabled = true;
        remove.disabled = true;
        try {
          const response = await authenticatedFetch(`${API_BASE}/v1/devices/${device.id}`, {
            method: 'DELETE', headers: { Accept: 'application/json' }
          });
          if (!response.ok) throw new Error('Não foi possível excluir o equipamento.');
          devicesLoaded = false;
          await loadDevices();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Falha ao excluir equipamento.');
          edit.disabled = false;
          toggle.disabled = false;
          remove.disabled = false;
        }
      });
      actions.append(edit, toggle, remove);
      card.append(actions);
    }
    deviceList.append(card);
  }
}

async function loadDevices() {
  devicesLoading.hidden = false;
  devicesError.hidden = true;
  deviceList.hidden = true;
  refreshDevicesButton.disabled = true;
  try {
    const [response, collectorsResponse] = await Promise.all([
      authenticatedFetch(`${API_BASE}/v1/devices/status`, {
        headers: { Accept: 'application/json' }, cache: 'no-store'
      }),
      currentUser?.role === 'admin' && !isPlatformContext()
        ? authenticatedFetch(`${API_BASE}/v1/collectors/status`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
        : Promise.resolve(null)
    ]);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('O serviço de equipamentos não respondeu corretamente.');
    if (collectorsResponse) {
      const collectorsPayload = await collectorsResponse.json().catch(() => ({}));
      if (!collectorsResponse.ok) throw new Error('Não foi possível obter os coletores disponíveis.');
      availableCollectors = collectorsPayload.collectors.filter((collector) => collector.configuredStatus !== 'disabled');
      populateCollectorSelect(createDeviceForm.collectorId);
    }
    deviceTotal.textContent = formatNumber(payload.summary.total);
    deviceReceiving.textContent = formatNumber(payload.summary.receiving);
    deviceAttention.textContent = formatNumber(payload.summary.attention);
    currentDevicePlan = payload.plan;
    if (payload.scope === 'platform') {
      devicePlan.textContent = formatNumber(payload.summary.clients);
      devicePlanUsage.textContent = 'com equipamentos cadastrados';
    } else {
      devicePlan.textContent = payload.plan.name;
      devicePlanUsage.textContent = payload.plan.deviceLimit === null
        ? `${formatNumber(payload.plan.devicesUsed)} cadastrado(s) · sem limite definido`
        : `${formatNumber(payload.plan.devicesUsed)} de ${formatNumber(payload.plan.deviceLimit)} equipamento(s)`;
    }
    syncDeviceCreateAvailability();
    devicesGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    renderDevices(payload.devices);
    devicesLoaded = true;
    devicesLoading.hidden = true;
    deviceList.hidden = false;
  } catch (error) {
    devicesLoading.hidden = true;
    if (!appShell.hidden) {
      devicesError.hidden = false;
      devicesErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshDevicesButton.disabled = false;
  }
}

createDeviceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!createDeviceForm.reportValidity()) return;
  setFormFeedback(createDeviceFeedback, '');
  setButtonLoading(createDeviceButton, true);
  const data = new FormData(createDeviceForm);
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        collectorId: String(data.get('collectorId')),
        name: String(data.get('name')).trim(),
        vendor: String(data.get('vendor')),
        exporterIp: String(data.get('exporterIp')).trim(),
        timezone: 'America/Sao_Paulo',
        enabled: true
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (payload.error === 'device_limit_reached') currentDevicePlan = payload.plan;
      const message = payload.error === 'exporter_ip_already_exists'
        ? 'Este IP de origem já está cadastrado.'
        : payload.error === 'device_limit_reached'
          ? `O plano ${payload.plan.name} permite ${formatNumber(payload.plan.deviceLimit)} equipamento(s). Exclua um equipamento para liberar uma vaga.`
          : 'Revise os dados do equipamento.';
      throw new Error(message);
    }
    createDeviceForm.reset();
    populateCollectorSelect(createDeviceForm.collectorId);
    setFormFeedback(createDeviceFeedback, `${payload.device.name} adicionado. O coletor receberá o cadastro no próximo heartbeat.`);
    devicesLoaded = false;
    await loadDevices();
  } catch (error) {
    setFormFeedback(createDeviceFeedback, error instanceof Error ? error.message : 'Falha ao adicionar equipamento.', true);
  } finally {
    setButtonLoading(createDeviceButton, false);
    syncDeviceCreateAvailability();
  }
});

function syncDeviceCreateAvailability() {
  const reached = currentDevicePlan?.deviceLimit !== null
    && currentDevicePlan?.devicesRemaining === 0;
  createDeviceButton.disabled = Boolean(reached);
  createDeviceButton.title = reached ? 'O limite de equipamentos do plano foi atingido.' : '';
}

closeDeviceDialog.addEventListener('click', () => deviceDialog.close());

editDeviceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editDeviceForm.reportValidity()) return;
  setFormFeedback(editDeviceFeedback, '');
  setButtonLoading(editDeviceSubmit, true);
  const data = new FormData(editDeviceForm);
  try {
    await saveDevice(String(data.get('deviceId')), {
      collectorId: String(data.get('collectorId')),
      name: String(data.get('name')).trim(),
      vendor: String(data.get('vendor')),
      exporterIp: String(data.get('exporterIp')).trim(),
      timezone: 'America/Sao_Paulo',
      enabled: data.get('enabled') === 'on'
    });
    deviceDialog.close();
    devicesLoaded = false;
    await loadDevices();
  } catch (error) {
    setFormFeedback(editDeviceFeedback, error instanceof Error ? error.message : 'Falha ao salvar equipamento.', true);
  } finally {
    setButtonLoading(editDeviceSubmit, false);
  }
});

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: index === 0 ? 0 : 1 }).format(value / (1024 ** index))} ${units[index]}`;
}

function showCollectorCredentials(credentials) {
  const apiRoot = `${window.location.origin}${API_BASE}`;
  const lines = [
    'ARGUS_ENV=production',
    `ARGUS_TENANT_ID=${credentials.tenantId}`,
    `ARGUS_COLLECTOR_ID=${credentials.collectorId}`,
    `ARGUS_SYNC_TOKEN=${credentials.token}`,
    `ARGUS_SYNC_URL=${apiRoot}/v1/ingest/batches`,
    `ARGUS_HEARTBEAT_URL=${apiRoot}/v1/ingest/heartbeat`,
    'ARGUS_DEVICE_ID=00000000-0000-0000-0000-000000000001',
    'ARGUS_DEVICE_VENDOR=unregistered',
    'ARGUS_DEVICE_TIMEZONE=America/Sao_Paulo',
    'ARGUS_DEVICES_JSON=[]',
    'ARGUS_SPOOL_PATH=/var/lib/argus/spool.sqlite',
    'ARGUS_NETFLOW_HOST=0.0.0.0',
    'ARGUS_NETFLOW_PORT=2055',
    'ARGUS_SYSLOG_HOST=0.0.0.0',
    'ARGUS_SYSLOG_PORT=5140',
    'ARGUS_A10_IGNORED_PROTOCOLS=GRE,ESP',
    'ARGUS_COLLECTOR_VERSION=0.1.0',
    'ARGUS_HEARTBEAT_INTERVAL_MS=10000',
    'ARGUS_SYNC_BATCH_SIZE=5000',
    'ARGUS_SYNC_INTERVAL_MS=1000',
    'ARGUS_SYNC_MAX_BATCHES_PER_TICK=4',
    'ARGUS_SYNC_RECOVERY_BATCH_SIZE=100',
    'ARGUS_EDGE_ACK_RETENTION_HOURS=24',
    'ARGUS_EDGE_BIND=0.0.0.0',
    'ARGUS_COLLECTOR_IMAGE_TAG=local'
  ];
  if (credentials.secondaryUrl) {
    const secondaryApiRoot = `${credentials.secondaryUrl.replace(/\/$/, '')}${API_BASE}`;
    lines.splice(6, 0,
      `ARGUS_SECONDARY_SYNC_URL=${secondaryApiRoot}/v1/ingest/batches`,
      `ARGUS_SECONDARY_HEARTBEAT_URL=${secondaryApiRoot}/v1/ingest/heartbeat`,
      `ARGUS_SECONDARY_SYNC_TOKEN=${credentials.token}`
    );
  }
  credentialConfig.value = lines.join('\n');
  setFormFeedback(credentialFeedback, '');
  credentialDialog.showModal();
}

function openCollectorEditor(collector) {
  editCollectorForm.collectorId.value = collector.id;
  editCollectorForm.name.value = collector.name;
  editCollectorForm.mode.value = collector.mode;
  editCollectorForm.active.checked = collector.configuredStatus !== 'disabled';
  setFormFeedback(editCollectorFeedback, '');
  collectorDialog.showModal();
}

async function saveCollector(collectorId, payload) {
  const response = await authenticatedFetch(`${API_BASE}/v1/collectors/${collectorId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Revise os dados do coletor.');
  return body.collector;
}

function collectorStatusPresentation(status) {
  const presentations = {
    connected: { label: 'Conectado', detail: 'telemetria em até 30 segundos' },
    delayed: { label: 'Atrasado', detail: 'telemetria há mais de 30 segundos' },
    offline: { label: 'Desconectado', detail: 'sem telemetria há mais de 5 minutos' },
    never: { label: 'Nunca conectado', detail: 'nenhum heartbeat recebido' },
    disabled: { label: 'Desativado', detail: 'credencial bloqueada no sistema' }
  };
  return presentations[status] || { label: status, detail: 'estado desconhecido' };
}

function renderCollectors(collectors) {
  collectorList.replaceChildren();
  for (const collector of collectors) {
    const card = document.createElement('article');
    card.className = 'collector-card';
    const primary = document.createElement('div');
    primary.className = 'collector-primary';

    const identity = document.createElement('div');
    identity.className = 'device-identity';
    const mode = document.createElement('span');
    const isCloudCollector = collector.mode === 'cloud';
    const modeLabel = isCloudCollector ? 'Coletor Cloud' : 'Coletor Edge';
    mode.className = `collector-mode ${isCloudCollector ? 'cloud' : 'edge'}`;
    mode.setAttribute('role', 'img');
    mode.setAttribute('aria-label', modeLabel);
    mode.title = modeLabel;
    mode.innerHTML = isCloudCollector
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 18.5H7a4.5 4.5 0 0 1-.7-8.95A6.5 6.5 0 0 1 18.8 11.4a3.6 3.6 0 0 1-1.3 7.1Z"/><path d="M9 14.5h6M13 12.5l2 2-2 2"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3.5" width="18" height="6.5" rx="1.7"/><rect x="3" y="14" width="18" height="6.5" rx="1.7"/><path d="M7 6.75h.01M11 6.75h6M7 17.25h.01M11 17.25h6"/></svg>';
    const identityCopy = document.createElement('div');
    const name = document.createElement('strong');
    const detail = document.createElement('small');
    name.textContent = collector.name;
    detail.textContent = collector.tenantName
      ? `${collector.tenantName} · Versão ${collector.version || 'não informada'}`
      : `Versão ${collector.version || 'não informada'}`;
    identityCopy.append(name, detail);
    identity.append(mode, identityCopy);

    const state = document.createElement('div');
    state.className = `device-state ${collector.connectionStatus}`;
    const stateDot = document.createElement('span');
    const stateCopy = document.createElement('div');
    const stateName = document.createElement('strong');
    const stateDetail = document.createElement('small');
    const presentation = collectorStatusPresentation(collector.connectionStatus);
    stateName.textContent = presentation.label;
    stateDetail.textContent = presentation.detail;
    stateCopy.append(stateName, stateDetail);
    state.append(stateDot, stateCopy);
    primary.append(identity, state);

    const metrics = document.createElement('div');
    metrics.className = 'collector-metrics';
    const primaryIngress = collector.ingressDestinations?.find((destination) => destination.role === 'primary');
    const secondaryIngress = collector.ingressDestinations?.find((destination) => destination.role === 'secondary');
    const ingressMetrics = isCloudCollector && primaryIngress
      ? [
          metric('NetFlow principal', `${primaryIngress.publicUrl} · ${primaryIngress.netflowPort}/UDP`),
          metric('Syslog principal', `${primaryIngress.publicUrl} · ${primaryIngress.syslogPort}/UDP`),
          ...(secondaryIngress ? [
            metric('NetFlow redundante', `${secondaryIngress.publicUrl} · ${secondaryIngress.netflowPort}/UDP`),
            metric('Syslog redundante', `${secondaryIngress.publicUrl} · ${secondaryIngress.syslogPort}/UDP`)
          ] : [])
        ]
      : [
          metric('NetFlow / IPFIX', collector.netflowPort ? `${collector.netflowPort}/UDP` : 'Não informado'),
          metric('Syslog', collector.syslogPort ? `${collector.syslogPort}/UDP` : 'Não informado')
        ];
    metrics.append(
      ...ingressMetrics,
      metric('Equipamentos', formatNumber(collector.deviceCount)),
      metric('Último heartbeat', formatDeviceMoment(collector.lastSeenAt)),
      metric('Último sincronismo', formatDeviceMoment(collector.lastSyncAt)),
      metric('Fila local', `${formatNumber(collector.pendingRecords)} reg. · ${formatNumber(collector.pendingEvents)} eventos`),
      metric('Sincronizado em 24h', `${formatNumber(collector.rawRecords24h)} reg. · ${formatNumber(collector.events24h)} eventos`),
      metric('Lotes em 24h', formatNumber(collector.batches24h)),
      metric('Spool local', formatBytes(collector.spoolBytes))
    );
    card.append(primary, metrics);

    if (collector.pendingRecords > 0) {
      const queue = document.createElement('p');
      queue.className = 'collector-queue-note';
      queue.textContent = `${collector.pendingBatches} lote(s) pendente(s). Item mais antigo: ${formatDeviceMoment(collector.oldestPendingAt)}.`;
      card.append(queue);
    }
    if (collector.lastSyncError) {
      const failure = document.createElement('p');
      failure.className = 'collector-queue-note collector-error-note';
      failure.textContent = `Último erro de sincronização: ${collector.lastSyncError}`;
      card.append(failure);
    }
    if (currentUser?.role === 'admin' && !isPlatformContext()) {
      const actions = document.createElement('div');
      actions.className = 'collector-admin-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'table-action';
      edit.textContent = 'Editar';
      edit.addEventListener('click', () => openCollectorEditor(collector));

      const toggle = document.createElement('button');
      const active = collector.configuredStatus !== 'disabled';
      toggle.type = 'button';
      toggle.className = `table-action ${active ? 'deactivate' : 'activate'}`;
      toggle.textContent = active ? 'Desativar' : 'Ativar';
      toggle.addEventListener('click', async () => {
        if (active && !window.confirm(`Desativar ${collector.name}? O envio será recusado até que o coletor seja ativado novamente.`)) return;
        edit.disabled = true;
        toggle.disabled = true;
        try {
          await saveCollector(collector.id, { name: collector.name, mode: collector.mode, active: !active });
          collectorsLoaded = false;
          firewallLoaded = false;
          devicesLoaded = false;
          await loadCollectors();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Falha ao atualizar coletor.');
          edit.disabled = false;
          toggle.disabled = false;
        }
      });

      const rotate = document.createElement('button');
      rotate.type = 'button';
      rotate.className = 'table-action danger';
      rotate.textContent = 'Rotacionar chave';
      rotate.addEventListener('click', async () => {
        const confirmed = window.confirm(`Gerar uma nova chave para ${collector.name}? A chave atual deixará de funcionar imediatamente.`);
        if (!confirmed) return;
        edit.disabled = true;
        toggle.disabled = true;
        rotate.disabled = true;
        try {
          const response = await authenticatedFetch(`${API_BASE}/v1/collectors/${collector.id}/rotate-credential`, {
            method: 'POST', headers: { Accept: 'application/json' }
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error('Não foi possível rotacionar a chave.');
          showCollectorCredentials(payload.credentials);
          collectorsLoaded = false;
          await loadCollectors();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Falha ao rotacionar a chave.');
          edit.disabled = false;
          toggle.disabled = false;
          rotate.disabled = false;
        }
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'table-action danger';
      remove.textContent = 'Excluir';
      remove.addEventListener('click', async () => {
        const confirmed = window.confirm(`Excluir ${collector.name}? A credencial será revogada, mas logs, lotes e auditoria serão preservados.`);
        if (!confirmed) return;
        edit.disabled = true;
        toggle.disabled = true;
        rotate.disabled = true;
        remove.disabled = true;
        try {
          const response = await authenticatedFetch(`${API_BASE}/v1/collectors/${collector.id}`, {
            method: 'DELETE', headers: { Accept: 'application/json' }
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload.error === 'collector_has_devices'
              ? 'Este coletor ainda possui equipamentos vinculados. Mova ou exclua esses equipamentos primeiro.'
              : 'Não foi possível excluir o coletor.');
          }
          collectorsLoaded = false;
          firewallLoaded = false;
          devicesLoaded = false;
          await loadCollectors();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Falha ao excluir coletor.');
          edit.disabled = false;
          toggle.disabled = false;
          rotate.disabled = false;
          remove.disabled = false;
        }
      });
      if (!isCloudCollector) actions.append(rotate);
      actions.append(edit, toggle, remove);
      card.append(actions);
    }
    collectorList.append(card);
  }
}

async function loadCollectors() {
  collectorsLoading.hidden = false;
  collectorsError.hidden = true;
  collectorList.hidden = true;
  refreshCollectorsButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/collectors/status`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('O serviço de coletores não respondeu corretamente.');
    collectorTotal.textContent = formatNumber(payload.summary.total);
    collectorConnected.textContent = formatNumber(payload.summary.connected);
    collectorPending.textContent = formatNumber(payload.summary.pendingRecords);
    collectorSpool.textContent = formatBytes(payload.summary.spoolBytes);
    const cloudOption = createCollectorForm.mode.querySelector('option[value="cloud"]');
    if (cloudOption) {
      cloudOption.disabled = !payload.summary.cloudAvailable;
      cloudOption.textContent = payload.summary.cloudAvailable
        ? 'Cloud gerenciado'
        : 'Cloud gerenciado — já cadastrado';
    }
    collectorsGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    renderCollectors(payload.collectors);
    collectorsLoaded = true;
    collectorsLoading.hidden = true;
    collectorList.hidden = false;
  } catch (error) {
    collectorsLoading.hidden = true;
    if (!appShell.hidden) {
      collectorsError.hidden = false;
      collectorsErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshCollectorsButton.disabled = false;
  }
}

function selectFirewallTab(tab) {
  const access = tab === 'access' && isPlatformContext();
  firewallAccessPanel.hidden = !access;
  firewallIngestionPanel.hidden = access;
  firewallAccessTab.classList.toggle('active', access);
  firewallAccessTab.setAttribute('aria-selected', String(access));
  firewallIngestionTab.classList.toggle('active', !access);
  firewallIngestionTab.setAttribute('aria-selected', String(!access));
}

async function updateInfrastructureFirewallPolicy(policy, mode, button) {
  button.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/firewall/infrastructure/${policy.service}/policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ mode })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error === 'infrastructure_firewall_authorization_required'
        ? 'Autorize pelo menos um IP ou uma rede antes de ativar a allowlist.'
        : 'Não foi possível salvar a política de acesso.');
    }
    firewallLoaded = false;
    await loadFirewall();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao salvar a política.');
    button.disabled = false;
  }
}

async function removeInfrastructureFirewallAuthorization(authorization, button) {
  if (!window.confirm(`Remover ${authorization.sourceCidr} desta allowlist?`)) return;
  button.disabled = true;
  try {
    const response = await authenticatedFetch(
      `${API_BASE}/v1/firewall/infrastructure/authorizations/${authorization.id}`,
      { method: 'DELETE', headers: { Accept: 'application/json' } }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error === 'last_infrastructure_firewall_authorization_required'
        ? 'A allowlist está ativa. Abra o acesso antes de remover a última origem.'
        : 'Não foi possível remover a origem.');
    }
    firewallLoaded = false;
    await loadFirewall();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao remover a origem.');
    button.disabled = false;
  }
}

function openFirewallRuleDialog(rule = null) {
  firewallRuleForm.reset();
  setFormFeedback(firewallRuleFeedback, '');
  firewallRuleId.value = rule?.id || '';
  firewallRuleSource.value = rule?.sourceCidr || '';
  firewallRuleDescription.value = rule?.description || '';
  firewallRuleService.value = rule?.service || 'web';
  firewallRuleDialogTitle.textContent = rule ? 'Editar regra' : 'Nova regra';
  firewallRuleSubmit.querySelector('.button-label').textContent = rule ? 'Salvar alterações' : 'Salvar regra';
  firewallRuleDialog.showModal();
  firewallRuleSource.focus();
}

async function saveInfrastructureFirewallRule() {
  if (!firewallRuleForm.reportValidity()) return;
  setButtonLoading(firewallRuleSubmit, true);
  setFormFeedback(firewallRuleFeedback, '');
  const authorizationId = firewallRuleId.value;
  const service = firewallRuleService.value;
  const editing = Boolean(authorizationId);
  const url = editing
    ? `${API_BASE}/v1/firewall/infrastructure/authorizations/${authorizationId}`
    : `${API_BASE}/v1/firewall/infrastructure/${service}/authorizations`;
  try {
    const response = await authenticatedFetch(url, {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        service,
        sourceCidr: firewallRuleSource.value.trim(),
        description: firewallRuleDescription.value.trim()
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        invalid_ipv4_cidr: 'Informe um IPv4 ou uma rede CIDR válida.',
        infrastructure_firewall_authorization_exists: 'Já existe uma regra igual para este serviço.',
        last_infrastructure_firewall_authorization_required: 'Esta é a última regra de um serviço restrito. Abra o serviço antes de movê-la.',
        firewall_authorization_not_found: 'A regra não está mais disponível.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível salvar a regra.');
    }
    firewallRuleDialog.close();
    firewallLoaded = false;
    await loadFirewall();
  } catch (error) {
    setFormFeedback(firewallRuleFeedback, error instanceof Error ? error.message : 'Falha ao salvar a regra.', true);
  } finally {
    setButtonLoading(firewallRuleSubmit, false);
  }
}

function renderInfrastructureFirewall(policies) {
  latestInfrastructureFirewallPolicies = policies;
  const canManage = currentUser?.role === 'admin' && hasPlatformPermission('firewall', 'manage');
  firewallNewRuleButton.hidden = !canManage;
  firewallServicePolicies.replaceChildren();
  for (const policy of policies) {
    const item = document.createElement('div');
    item.className = 'firewall-service-policy';
    const name = document.createElement('div');
    name.innerHTML = `<strong>${policy.service === 'web' ? 'Acesso WEB' : 'SSH'}</strong>`;
    const state = document.createElement('span');
    state.className = `firewall-policy-badge ${policy.mode === 'allowlist' ? 'enforce' : 'open'}`;
    state.textContent = policy.mode === 'allowlist' ? 'Somente IPs permitidos' : 'Aberto';
    item.append(name, state);
    if (canManage) {
      const selector = document.createElement('select');
      selector.innerHTML = '<option value="open">Aberto</option><option value="allowlist">Somente allowlist</option>';
      selector.value = policy.mode;
      selector.setAttribute('aria-label', `Política de ${policy.service === 'web' ? 'Acesso WEB' : 'SSH'}`);
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'secondary-button firewall-apply-button';
      apply.textContent = 'Aplicar';
      apply.disabled = true;
      selector.addEventListener('change', () => { apply.disabled = selector.value === policy.mode; });
      apply.addEventListener('click', () => void updateInfrastructureFirewallPolicy(policy, selector.value, apply));
      item.append(selector, apply);
    }
    firewallServicePolicies.append(item);
  }

  const query = firewallRuleSearch.value.trim().toLocaleLowerCase('pt-BR');
  const filter = firewallRuleFilter.value;
  const rules = policies.flatMap((policy) => policy.authorizations.map((authorization) => ({
    ...authorization, service: policy.service
  }))).filter((rule) => (filter === 'all' || rule.service === filter)
    && (!query || `${rule.sourceCidr} ${rule.description}`.toLocaleLowerCase('pt-BR').includes(query)));
  firewallRuleBody.replaceChildren();
  firewallRulesEmpty.hidden = rules.length > 0;
  firewallRuleBody.closest('.table-wrap').hidden = rules.length === 0;
  for (const rule of rules) {
    const row = document.createElement('tr');
    const source = td(rule.sourceCidr, 'IP / Rede');
    source.className = 'firewall-rule-source';
    const service = td(rule.service === 'web' ? 'Acesso WEB' : 'SSH', 'Serviço');
    const actions = document.createElement('td');
    actions.dataset.label = 'Ações';
    actions.className = 'firewall-rule-actions';
    if (canManage) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'table-action';
      edit.textContent = 'Editar';
      edit.addEventListener('click', () => openFirewallRuleDialog(rule));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'table-action danger';
      remove.textContent = 'Excluir';
      remove.addEventListener('click', () => void removeInfrastructureFirewallAuthorization(rule, remove));
      actions.append(edit, remove);
    } else {
      actions.textContent = 'Somente leitura';
    }
    row.append(
      source,
      td(rule.description || '—', 'Descrição'),
      service,
      td(formatDeviceMoment(rule.createdAt), 'Criado em'),
      actions
    );
    firewallRuleBody.append(row);
  }
}

function combineFirewallObservations(observations) {
  const sources = new Map();
  for (const observation of observations) {
    const current = sources.get(observation.sourceIp) || {
      sourceIp: observation.sourceIp,
      sourceTypes: new Set(),
      firstSeenAt: observation.firstSeenAt,
      lastSeenAt: observation.lastSeenAt,
      packetCount: 0,
      blockedPacketCount: 0,
      authorized: false,
      privateSource: observation.privateSource
    };
    current.sourceTypes.add(observation.sourceType);
    if (Date.parse(observation.firstSeenAt) < Date.parse(current.firstSeenAt)) current.firstSeenAt = observation.firstSeenAt;
    if (Date.parse(observation.lastSeenAt) > Date.parse(current.lastSeenAt)) current.lastSeenAt = observation.lastSeenAt;
    current.packetCount += observation.packetCount;
    current.blockedPacketCount += observation.blockedPacketCount;
    current.authorized ||= observation.authorized;
    sources.set(observation.sourceIp, current);
  }
  return [...sources.values()].sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt));
}

async function updateFirewallPolicy(collector, mode, button) {
  if (mode === 'enforce') {
    const confirmed = window.confirm(
      `Ativar a proteção de ${collector.name}? Somente as origens autorizadas continuarão enviando logs.`
    );
    if (!confirmed) return;
  }
  button.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/firewall/collectors/${collector.id}/policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ mode })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        firewall_authorization_required: 'Autorize pelo menos um IP público ou uma rede antes de ativar a proteção.',
        edge_firewall_managed_locally: 'O firewall deste coletor Edge é administrado no servidor local.',
        collector_not_found: 'O coletor não está mais disponível.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível alterar a política.');
    }
    firewallLoaded = false;
    await loadFirewall();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao atualizar o firewall.');
    button.disabled = false;
  }
}

async function authorizeFirewallSource(collector, sourceCidr, description, button) {
  button.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/firewall/collectors/${collector.id}/authorizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sourceCidr, description })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        invalid_ipv4_cidr: 'Informe um IPv4 ou uma rede CIDR válida.',
        firewall_authorization_exists: 'Esta origem já está autorizada.',
        edge_firewall_managed_locally: 'O firewall deste coletor Edge é administrado no servidor local.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível autorizar a origem.');
    }
    firewallLoaded = false;
    await loadFirewall();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao autorizar a origem.');
    button.disabled = false;
  }
}

async function removeFirewallAuthorization(authorization, button) {
  if (!window.confirm(`Remover a autorização de ${authorization.sourceCidr}?`)) return;
  button.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/firewall/authorizations/${authorization.id}`, {
      method: 'DELETE', headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error === 'last_firewall_authorization_required'
        ? 'A proteção está ativa. Volte para Monitoramento antes de remover a última origem.'
        : 'Não foi possível remover a autorização.');
    }
    firewallLoaded = false;
    await loadFirewall();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao remover a autorização.');
    button.disabled = false;
  }
}

function renderFirewallCollectors(collectors) {
  firewallCollectorList.replaceChildren();
  if (!collectors.length) {
    const empty = document.createElement('div');
    empty.className = 'state compact-state';
    empty.innerHTML = '<div class="state-icon" aria-hidden="true">◇</div><strong>Nenhum coletor cadastrado</strong><p>Crie um coletor para começar a validar as origens de ingestão.</p>';
    firewallCollectorList.append(empty);
    return;
  }
  const canManage = currentUser?.role === 'admin'
    && (!isPlatformContext() || hasPlatformPermission('firewall', 'manage'));
  for (const collector of collectors) {
    const card = document.createElement('article');
    card.className = `firewall-collector-card ${collector.collectorMode} ${collector.policyMode || 'local'}`;

    const head = document.createElement('div');
    head.className = 'firewall-collector-head';
    const identity = document.createElement('div');
    identity.className = 'firewall-collector-identity';
    const icon = document.createElement('span');
    icon.className = 'firewall-collector-icon';
    icon.innerHTML = `<svg aria-hidden="true"><use href="#${collector.collectorMode === 'cloud' ? 'icon-shield' : 'icon-server'}"/></svg>`;
    const copy = document.createElement('div');
    const context = document.createElement('span');
    context.textContent = isPlatformContext() ? collector.tenantName : collector.collectorMode === 'cloud' ? 'Coletor Cloud' : 'Coletor Edge';
    const title = document.createElement('h3');
    title.textContent = collector.name;
    copy.append(context, title);
    if (collector.collectorMode === 'cloud') {
      const ports = document.createElement('div');
      ports.className = 'firewall-port-list';
      ports.innerHTML = `<span><small>NETFLOW PRINCIPAL</small><strong>${collector.netflowPort}/UDP</strong></span><span><small>SYSLOG PRINCIPAL</small><strong>${collector.syslogPort}/UDP</strong></span>${collector.secondaryNetflowPort ? `<span><small>NETFLOW REDUNDANTE</small><strong>${collector.secondaryNetflowPort}/UDP</strong></span><span><small>SYSLOG REDUNDANTE</small><strong>${collector.secondarySyslogPort}/UDP</strong></span>` : ''}`;
      copy.append(ports);
    } else {
      const localDescription = document.createElement('p');
      localDescription.textContent = 'Proteção de entrada administrada no servidor local';
      copy.append(localDescription);
    }
    identity.append(icon, copy);
    head.append(identity);

    if (collector.collectorMode === 'cloud') {
      const controls = document.createElement('div');
      controls.className = 'firewall-policy-controls';
      const policySummary = document.createElement('div');
      policySummary.className = 'firewall-policy-summary';
      const status = document.createElement('span');
      status.className = `firewall-policy-badge ${collector.policyMode}`;
      status.textContent = collector.policyMode === 'enforce' ? 'Proteção ativa' : 'Monitoramento';
      const synchronization = document.createElement('small');
      synchronization.className = collector.policySynchronized ? 'synchronized' : 'pending';
      synchronization.textContent = collector.policySynchronized
        ? `Aplicado em ${formatDeviceMoment(collector.appliedAt)}`
        : 'Aplicação pendente no coletor';
      policySummary.append(status, synchronization);
      controls.append(policySummary);
      if (canManage) {
        const policyLabel = document.createElement('label');
        policyLabel.textContent = 'Política de entrada';
        const selector = document.createElement('select');
        selector.setAttribute('aria-label', `Política de ${collector.name}`);
        selector.innerHTML = '<option value="monitor">Monitoramento</option><option value="enforce">Proteção ativa</option>';
        selector.value = collector.policyMode;
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'secondary-button firewall-apply-button';
        apply.textContent = 'Aplicar';
        apply.disabled = true;
        selector.addEventListener('change', () => { apply.disabled = selector.value === collector.policyMode; });
        apply.addEventListener('click', () => void updateFirewallPolicy(collector, selector.value, apply));
        const form = document.createElement('div');
        form.className = 'firewall-policy-form';
        form.append(policyLabel, selector, apply);
        controls.append(form);
      }
      head.append(controls);
    } else {
      const status = document.createElement('span');
      status.className = 'firewall-policy-badge local';
      status.textContent = 'Gerenciado localmente';
      head.append(status);
    }
    card.append(head);

    if (collector.collectorMode === 'edge') {
      const localNote = document.createElement('div');
      localNote.className = 'firewall-local-note';
      localNote.innerHTML = '<strong>Coletor Edge</strong><span>As portas e regras pertencem à VM instalada no cliente. O LogVault não altera o firewall desse servidor remotamente.</span>';
      card.append(localNote);
      firewallCollectorList.append(card);
      continue;
    }

    const authorizedSection = document.createElement('section');
    authorizedSection.className = 'firewall-authorized-section';
    const authorizedHead = document.createElement('div');
    authorizedHead.className = 'firewall-section-head';
    authorizedHead.innerHTML = `<div class="firewall-section-title"><span>ORIGENS AUTORIZADAS</span><strong>${formatNumber(collector.authorizations.length)}</strong><small>IPs e redes com permissão para enviar dados a este coletor.</small></div>`;
    authorizedSection.append(authorizedHead);
    const authorizationList = document.createElement('div');
    authorizationList.className = 'firewall-authorization-list';
    if (!collector.authorizations.length) {
      const none = document.createElement('p');
      none.className = 'firewall-empty-copy';
      none.textContent = 'Nenhuma origem autorizada. Continue em monitoramento até validar o IP público.';
      authorizationList.append(none);
    }
    for (const authorization of collector.authorizations) {
      const item = document.createElement('div');
      item.className = 'firewall-authorization';
      const itemIcon = document.createElement('span');
      itemIcon.className = 'firewall-authorization-icon';
      itemIcon.innerHTML = '<svg aria-hidden="true"><use href="#icon-shield"/></svg>';
      const value = document.createElement('div');
      value.className = 'firewall-authorization-copy';
      const cidr = document.createElement('strong');
      cidr.textContent = authorization.sourceCidr;
      const detail = document.createElement('span');
      detail.textContent = authorization.description || 'Origem autorizada';
      const createdAt = document.createElement('small');
      createdAt.textContent = `Adicionada em ${formatDeviceMoment(authorization.createdAt)}`;
      value.append(cidr, detail, createdAt);
      item.append(itemIcon, value);
      if (canManage) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'table-action danger';
        remove.textContent = 'Remover';
        remove.addEventListener('click', () => void removeFirewallAuthorization(authorization, remove));
        item.append(remove);
      }
      authorizationList.append(item);
    }
    authorizedSection.append(authorizationList);
    if (canManage) {
      const addPanel = document.createElement('div');
      addPanel.className = 'firewall-add-origin';
      const addCopy = document.createElement('div');
      addCopy.className = 'firewall-add-origin-copy';
      addCopy.innerHTML = '<strong>Autorizar nova origem</strong><span>Informe um IP público individual ou uma rede CIDR controlada.</span>';
      const form = document.createElement('form');
      form.className = 'firewall-authorization-form';
      const sourceField = document.createElement('label');
      sourceField.innerHTML = '<span>IP OU REDE CIDR</span>';
      const source = document.createElement('input');
      source.required = true;
      source.placeholder = 'Ex.: 203.0.113.10 ou 203.0.113.0/24';
      source.setAttribute('aria-label', 'IP público ou rede CIDR');
      sourceField.append(source);
      const descriptionField = document.createElement('label');
      descriptionField.innerHTML = '<span>IDENTIFICAÇÃO <small>OPCIONAL</small></span>';
      const description = document.createElement('input');
      description.placeholder = 'Ex.: Cisco ASR · POP Centro';
      description.maxLength = 200;
      description.setAttribute('aria-label', 'Descrição da origem');
      descriptionField.append(description);
      const add = document.createElement('button');
      add.type = 'submit';
      add.className = 'primary-button firewall-add-button';
      add.textContent = 'Autorizar origem';
      form.append(sourceField, descriptionField, add);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        void authorizeFirewallSource(collector, source.value, description.value.trim(), add);
      });
      addPanel.append(addCopy, form);
      authorizedSection.append(addPanel);
    }
    card.append(authorizedSection);

    const observedSection = document.createElement('section');
    observedSection.className = 'firewall-observed-section';
    const observedHead = document.createElement('div');
    observedHead.className = 'firewall-section-head';
    const combined = combineFirewallObservations(collector.observations);
    observedHead.innerHTML = `<div class="firewall-section-title"><span>ORIGENS OBSERVADAS</span><strong>${formatNumber(combined.length)}</strong><small>Endereços de transporte identificados nas portas deste coletor.</small></div><small>IP visto pela VM do LogVault</small>`;
    observedSection.append(observedHead);
    if (!combined.length) {
      const none = document.createElement('p');
      none.className = 'firewall-empty-copy firewall-empty-observations';
      none.innerHTML = '<span class="firewall-empty-icon"><svg aria-hidden="true"><use href="#icon-activity"/></svg></span><span><strong>Aguardando o primeiro pacote</strong><small>Nenhuma origem foi observada nas portas deste coletor desde o início do monitoramento.</small></span>';
      observedSection.append(none);
    }
    for (const source of combined) {
      const row = document.createElement('div');
      row.className = 'firewall-observation';
      const address = document.createElement('div');
      address.className = 'firewall-observation-address';
      const addressValue = document.createElement('strong');
      addressValue.textContent = source.sourceIp;
      const tags = document.createElement('span');
      tags.textContent = [...source.sourceTypes].map((type) => type === 'syslog' ? 'Syslog' : 'NetFlow/IPFIX').join(' + ');
      address.append(addressValue, tags);
      if (source.privateSource) {
        const privateTag = document.createElement('em');
        privateTag.textContent = 'Origem privada';
        address.append(privateTag);
      }
      const activity = document.createElement('div');
      activity.className = 'firewall-observation-activity';
      activity.innerHTML = `<span>Último pacote<strong>${formatDeviceMoment(source.lastSeenAt)}</strong></span><span>Recebidos<strong>${formatNumber(source.packetCount)}</strong></span><span>Bloqueados<strong>${formatNumber(source.blockedPacketCount)}</strong></span>`;
      const state = document.createElement('span');
      state.className = `firewall-source-state ${source.authorized ? 'allowed' : collector.policyMode === 'enforce' ? 'blocked' : 'observed'}`;
      state.textContent = source.authorized ? 'Autorizada' : collector.policyMode === 'enforce' ? 'Bloqueada' : 'Observada';
      row.append(address, activity, state);
      if (canManage && !source.authorized) {
        const authorize = document.createElement('button');
        authorize.type = 'button';
        authorize.className = 'secondary-button firewall-source-authorize';
        authorize.textContent = 'Autorizar IP';
        authorize.addEventListener('click', () => void authorizeFirewallSource(
          collector, source.sourceIp, 'Origem detectada automaticamente pelo LogVault', authorize
        ));
        row.append(authorize);
      }
      observedSection.append(row);
    }
    card.append(observedSection);
    firewallCollectorList.append(card);
  }
}

async function loadFirewall() {
  firewallLoading.hidden = false;
  firewallError.hidden = true;
  firewallCollectorList.hidden = true;
  if (isPlatformContext()) {
    firewallServicePolicies.innerHTML = '<div class="device-loading-dot" aria-hidden="true"></div><strong>Carregando regras…</strong>';
    firewallRuleBody.replaceChildren();
  }
  refreshFirewallButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/firewall`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('O serviço de firewall não respondeu corretamente.');
    firewallCloudTotal.textContent = formatNumber(payload.summary.cloudCollectors);
    firewallEnforcing.textContent = formatNumber(payload.summary.enforcing);
    firewallMonitoring.textContent = formatNumber(payload.summary.monitoring);
    firewallBlocked.textContent = formatNumber(payload.summary.blockedPackets);
    firewallGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    if (isPlatformContext()) renderInfrastructureFirewall(payload.infrastructureAccess || []);
    renderFirewallCollectors(payload.collectors);
    firewallLoaded = true;
    firewallLoading.hidden = true;
    firewallCollectorList.hidden = false;
  } catch (error) {
    firewallLoading.hidden = true;
    if (isPlatformContext()) {
      firewallServicePolicies.innerHTML = '<strong>Não foi possível carregar as regras administrativas.</strong>';
    }
    if (!appShell.hidden) {
      firewallError.hidden = false;
      firewallErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshFirewallButton.disabled = false;
  }
}

createCollectorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!createCollectorForm.reportValidity()) return;
  setFormFeedback(createCollectorFeedback, '');
  setButtonLoading(createCollectorButton, true);
  const data = new FormData(createCollectorForm);
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/collectors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: String(data.get('name')).trim(),
        mode: String(data.get('mode'))
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error === 'cloud_collector_already_exists'
        ? 'Este cliente já possui um coletor Cloud gerenciado.'
        : payload.error === 'cloud_port_capacity_exhausted'
          ? 'Não há porta Cloud disponível. Contate o administrador da plataforma.'
          : 'Revise os dados do coletor.');
    }
    createCollectorForm.reset();
    const ingressSummary = payload.ingress?.destinations?.map((destination) =>
      `${destination.role === 'primary' ? 'Principal' : 'Redundante'} ${destination.publicUrl}: NetFlow UDP ${destination.netflowPort}, Syslog UDP ${destination.syslogPort}`
    ).join(' · ');
    setFormFeedback(createCollectorFeedback, payload.managed
      ? `${payload.collector.name} provisionado. ${ingressSummary || `NetFlow/IPFIX: UDP ${payload.ingress.netflowPort}. Syslog: UDP ${payload.ingress.syslogPort}.`}`
      : `${payload.collector.name} criado. Copie a credencial exibida para o servidor local.`);
    collectorsLoaded = false;
    firewallLoaded = false;
    devicesLoaded = false;
    await loadCollectors();
    if (payload.credentials) showCollectorCredentials(payload.credentials);
  } catch (error) {
    setFormFeedback(createCollectorFeedback, error instanceof Error ? error.message : 'Falha ao criar coletor.', true);
  } finally {
    setButtonLoading(createCollectorButton, false);
  }
});

closeCollectorDialog.addEventListener('click', () => collectorDialog.close());

editCollectorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!editCollectorForm.reportValidity()) return;
  setFormFeedback(editCollectorFeedback, '');
  setButtonLoading(editCollectorSubmit, true);
  const data = new FormData(editCollectorForm);
  try {
    await saveCollector(String(data.get('collectorId')), {
      name: String(data.get('name')).trim(),
      mode: editCollectorForm.mode.value,
      active: data.get('active') === 'on'
    });
    collectorDialog.close();
    collectorsLoaded = false;
    firewallLoaded = false;
    devicesLoaded = false;
    await loadCollectors();
  } catch (error) {
    setFormFeedback(editCollectorFeedback, error instanceof Error ? error.message : 'Falha ao salvar coletor.', true);
  } finally {
    setButtonLoading(editCollectorSubmit, false);
  }
});

copyCredentialButton.addEventListener('click', async () => {
  let copied = false;
  try {
    await navigator.clipboard.writeText(credentialConfig.value);
    copied = true;
  } catch {
    credentialConfig.focus();
    credentialConfig.select();
    copied = document.execCommand('copy');
  }
  setFormFeedback(
    credentialFeedback,
    copied ? 'Configuração copiada.' : 'Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.',
    !copied
  );
});

credentialDialog.addEventListener('close', () => {
  credentialConfig.value = '';
  setFormFeedback(credentialFeedback, '');
});

function systemStatusLabel(status) {
  return { ok: 'Normal', warning: 'Atenção', critical: 'Crítico' }[status] || status;
}

function alertSourceLabel(source) {
  return { backup: 'Backup', collector: 'Coletor', continuity: 'Continuidade', device: 'Equipamento', parser: 'Parser', spool: 'Spool', server: 'Servidor' }[source] || source;
}

function serviceIssueStatus(alerts, sources) {
  const matches = alerts.filter((alert) => sources.includes(alert.source));
  if (matches.some((alert) => alert.severity === 'critical')) return 'critical';
  return matches.length ? 'warning' : 'ok';
}

function renderSystemServices(payload) {
  const backupStatus = payload.backup.status === 'ok'
    ? 'ok'
    : payload.backup.status === 'delayed' ? 'warning' : 'critical';
  const processingStatus = serviceIssueStatus(payload.alerts, ['collector', 'spool', 'parser']);
  const processingIssues = payload.alerts.filter((alert) => ['collector', 'spool', 'parser'].includes(alert.source)).length;
  const services = [
    { name: 'Interface web', detail: 'Nginx respondendo e entregando a aplicação.', status: 'ok' },
    { name: 'API LogVault', detail: 'Autenticação, consultas e operações disponíveis.', status: 'ok' },
    { name: 'PostgreSQL', detail: 'Cadastros, sessões e auditoria acessíveis.', status: 'ok' },
    { name: 'ClickHouse', detail: 'Logs CGNAT e consultas analíticas acessíveis.', status: 'ok' },
    {
      name: 'Coleta e processamento',
      detail: processingIssues
        ? `${formatNumber(processingIssues)} ocorrência(s) relacionada(s) à coleta, fila ou parsing.`
        : `${formatNumber(payload.summary.collectors)} coletor(es) monitorado(s), sem ocorrências de processamento.`,
      status: processingStatus
    },
    {
      name: 'Rotina de backup',
      detail: payload.backup.latest
        ? `Última execução em ${formatDeviceMoment(payload.backup.latest.createdAt)}.`
        : 'Nenhuma execução concluída até o momento.',
      status: backupStatus
    }
  ];
  systemServiceList.replaceChildren();
  for (const service of services) {
    const card = document.createElement('article');
    card.className = 'system-service-card';
    const heading = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = service.name;
    const status = document.createElement('span');
    status.className = `system-service-status ${service.status}`;
    status.textContent = service.status === 'ok' ? 'Operacional' : service.status === 'critical' ? 'Crítico' : 'Atenção';
    heading.append(name, status);
    const detail = document.createElement('p');
    detail.textContent = service.detail;
    card.append(heading, detail);
    systemServiceList.append(card);
  }
  systemServiceTotal.textContent = formatNumber(services.length);
  systemServiceRunning.textContent = formatNumber(services.filter((service) => service.status === 'ok').length);
  systemServiceAttention.textContent = formatNumber(services.filter((service) => service.status !== 'ok').length);
}

function renderSystemAlerts(alerts) {
  alertsBody.replaceChildren();
  const platformContext = isPlatformContext();
  for (const alert of alerts) {
    const row = document.createElement('tr');
    const severityCell = document.createElement('td');
    severityCell.dataset.label = 'Severidade';
    const severity = document.createElement('span');
    severity.className = `system-severity ${alert.severity}`;
    severity.textContent = alert.severity === 'critical' ? 'Crítico' : 'Aviso';
    severityCell.append(severity);
    const sourceCell = document.createElement('td');
    sourceCell.dataset.label = 'Origem';
    const source = document.createElement('span');
    source.className = 'system-source';
    source.textContent = alertSourceLabel(alert.source);
    sourceCell.append(source);
    const actionCell = document.createElement('td');
    actionCell.dataset.label = 'Ações';
    actionCell.className = 'system-alert-action';
    const investigate = document.createElement('button');
    investigate.type = 'button';
    investigate.className = 'table-action';
    investigate.textContent = 'Investigar';
    investigate.addEventListener('click', () => void openAlertInvestigation(alert));
    actionCell.append(investigate);
    const titleCell = td(alert.title, 'Alerta', 'system-alert-title');
    const cells = [severityCell];
    if (platformContext) cells.push(td(alert.tenantName || 'Plataforma', 'Cliente', 'system-alert-client'));
    cells.push(sourceCell, titleCell, td(alert.detail, 'Detalhes', 'system-alert-detail'), actionCell);
    row.append(...cells);
    alertsBody.append(row);
  }
}

function renderAlertEvidence(records) {
  alertInvestigationEvidence.replaceChildren();
  for (const record of records) {
    const card = document.createElement('article');
    card.className = 'alert-evidence-card';
    const head = document.createElement('div');
    head.className = 'alert-evidence-head';
    const moment = document.createElement('strong');
    moment.textContent = formatDeviceMoment(record.receivedAt);
    const rawId = document.createElement('span');
    rawId.textContent = record.rawId;
    rawId.title = record.rawId;
    head.append(moment, rawId);
    const meta = document.createElement('div');
    meta.className = 'alert-evidence-meta';
    const items = [
      record.exporterIp,
      record.sourceType === 'netflow_v9' ? 'NetFlow v9' : 'Syslog',
      record.parseStatus === 'missing_template' ? 'Template ausente' : record.parseStatus === 'unrecognized' ? 'Não reconhecido' : 'Erro',
      `Parser ${record.parserVersion}`
    ];
    for (const item of items) {
      const badge = document.createElement('span');
      badge.textContent = item;
      meta.append(badge);
    }
    const error = document.createElement('p');
    error.className = 'alert-evidence-error';
    error.textContent = record.parseError || (record.parseStatus === 'unrecognized'
      ? 'O conteúdo não correspondeu a um formato CGNAT reconhecido.'
      : record.parseStatus === 'missing_template'
        ? 'O template NetFlow necessário ainda não havia sido recebido.'
        : 'O parser não informou uma mensagem adicional.');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = record.rawFormat === 'text' ? 'Ver registro bruto' : 'Ver payload em Base64';
    const preview = document.createElement('pre');
    preview.textContent = `${record.rawPreview}${record.truncated ? '\n… conteúdo truncado na visualização' : ''}`;
    details.append(summary, preview);
    card.append(head, meta, error, details);
    alertInvestigationEvidence.append(card);
  }
}

async function openAlertInvestigation(alert) {
  alertInvestigationTitle.textContent = alert.title;
  alertInvestigationGenerated.textContent = 'Consultando o estado atual';
  alertInvestigationLoading.hidden = false;
  alertInvestigationError.hidden = true;
  alertInvestigationResult.hidden = true;
  alertInvestigationContext.replaceChildren();
  alertInvestigationActions.replaceChildren();
  alertInvestigationEvidence.replaceChildren();
  alertInvestigationDialog.showModal();
  try {
    const investigationQuery = alert.tenantId ? `?tenantId=${encodeURIComponent(alert.tenantId)}` : '';
    const response = await authenticatedFetch(
      `${API_BASE}/v1/system/alerts/${encodeURIComponent(alert.id)}/investigation${investigationQuery}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error === 'alert_no_longer_active'
        ? 'O alerta não está mais ativo. Atualize a lista para confirmar a recuperação.'
        : 'Não foi possível reunir as evidências deste alerta.');
    }
    alertInvestigationTitle.textContent = payload.alert.title;
    alertInvestigationGenerated.textContent = `Diagnóstico atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    alertInvestigationSeverity.className = payload.alert.severity;
    alertInvestigationSeverity.textContent = payload.alert.severity === 'critical' ? 'Crítico' : 'Aviso';
    alertInvestigationHeading.textContent = payload.alert.detail;
    alertInvestigationExplanation.textContent = payload.explanation;
    for (const item of payload.context) {
      const article = document.createElement('article');
      const label = document.createElement('span');
      const value = document.createElement('strong');
      label.textContent = item.label;
      value.textContent = item.value;
      article.append(label, value);
      alertInvestigationContext.append(article);
    }
    for (const action of payload.recommendedActions) {
      const item = document.createElement('li');
      item.textContent = action;
      alertInvestigationActions.append(item);
    }
    const hasEvidence = Array.isArray(payload.evidence) && payload.evidence.length > 0;
    alertInvestigationEvidenceSection.hidden = !hasEvidence;
    alertInvestigationEmpty.hidden = hasEvidence;
    if (hasEvidence) renderAlertEvidence(payload.evidence);
    alertInvestigationLoading.hidden = true;
    alertInvestigationResult.hidden = false;
  } catch (error) {
    alertInvestigationLoading.hidden = true;
    alertInvestigationError.hidden = false;
    alertInvestigationErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
  }
}

closeAlertInvestigationButton.addEventListener('click', () => alertInvestigationDialog.close());

function renderBackups(backups, downloadAllowed) {
  backupBody.replaceChildren();
  for (const backup of backups) {
    const row = document.createElement('tr');
    const downloadCell = document.createElement('td');
    downloadCell.dataset.label = 'Proteção manual';
    if (downloadAllowed) {
      const download = document.createElement('a');
      download.className = 'table-action backup-download';
      download.href = `${API_BASE}/v1/system/backups/${encodeURIComponent(backup.id)}/download`;
      download.textContent = 'Baixar .tar.gz';
      download.title = `Baixar pacote restaurável ${backup.id}`;
      downloadCell.append(download);
    } else {
      downloadCell.textContent = 'Somente administrador';
    }
    row.append(
      td(formatDeviceMoment(backup.createdAt), 'Concluído em'),
      td(formatBytes(backup.postgresBytes), 'PostgreSQL'),
      td(formatBytes(backup.clickhouseBytes), 'ClickHouse'),
      td(backup.collectorIncluded ? formatBytes(backup.collectorBytes) : 'Não incluído', 'Spool local'),
      td(backup.id, 'ID', 'audit-id'),
      downloadCell
    );
    backupBody.append(row);
  }
}

const tenantBackupStatusLabels = {
  pending: 'Na fila', processing: 'Gerando pacote', ready: 'Pronto', failed: 'Falhou'
};

function renderTenantBackups(backups) {
  tenantBackupBody.replaceChildren();
  for (const backup of backups) {
    const expired = backup.status === 'ready' && backup.expiresAt && Date.parse(backup.expiresAt) <= Date.now();
    const actionCell = document.createElement('td');
    actionCell.dataset.label = 'Ação';
    if (backup.status === 'ready' && !expired) {
      const link = document.createElement('a');
      link.className = 'table-action backup-download';
      link.href = `${API_BASE}/v1/backups/${encodeURIComponent(backup.id)}/download`;
      link.textContent = 'Baixar .tar.gz';
      actionCell.append(link);
    } else actionCell.textContent = expired ? 'Download expirado'
      : backup.status === 'failed' ? backup.errorMessage || 'Falha no processamento' : 'Aguarde';
    const external = backup.sendToGoogleDrive
      ? backup.googleDriveFileId ? 'Google Drive concluído' : backup.status === 'failed' ? 'Falhou' : 'Pendente'
      : 'Não solicitado';
    const row = document.createElement('tr');
    row.append(
      td(formatDeviceMoment(backup.requestedAt), 'Solicitado em'),
      td(expired ? 'Expirado' : tenantBackupStatusLabels[backup.status] || backup.status, 'Estado'),
      td(backup.byteCount ? formatBytes(backup.byteCount) : '—', 'Tamanho'),
      td(external, 'Cópia externa'),
      actionCell
    );
    tenantBackupBody.append(row);
  }
  tenantBackupEmpty.hidden = backups.length !== 0;
  tenantBackupTableWrap.hidden = backups.length === 0;
}

async function loadTenantBackups({ poll = true } = {}) {
  if (tenantBackupPollTimer) window.clearTimeout(tenantBackupPollTimer);
  tenantBackupPollTimer = null;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/backups`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('Não foi possível consultar os backups do cliente.');
    renderTenantBackups(payload.backups || []);
    tenantBackupGoogleDrive.disabled = !payload.googleDriveAvailable;
    if (!payload.googleDriveAvailable) tenantBackupGoogleDrive.checked = false;
    tenantBackupGoogleDriveDetail.textContent = payload.googleDriveAvailable
      ? 'Destino externo validado pela plataforma.' : 'O administrador da plataforma ainda não habilitou este destino.';
    const active = (payload.backups || []).some((backup) => ['pending', 'processing'].includes(backup.status));
    if (poll && active && !systemView.hidden) tenantBackupPollTimer = window.setTimeout(() => void loadTenantBackups(), 3000);
  } catch (error) {
    setFormFeedback(tenantBackupFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  }
}

async function loadPlatformBackupDestination() {
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/backup-destination`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('Não foi possível consultar o destino externo.');
    const destination = payload.destination;
    backupDriveEnabled.checked = Boolean(destination.enabled);
    backupDriveFolderId.value = destination.folderId || '';
    backupDriveRetention.value = String(destination.retentionDays || 30);
    backupDriveCredentials.value = '';
    backupDrivePassphrase.value = '';
    backupDriveCredentials.placeholder = destination.credentialsConfigured
      ? 'Credencial protegida; cole um JSON somente para substituí-la' : 'Cole o JSON da conta de serviço';
    backupDrivePassphrase.placeholder = destination.encryptionConfigured
      ? 'Frase protegida; preencha somente para substituí-la' : 'Mínimo de 20 caracteres; guarde fora do servidor';
    platformBackupDestinationStatus.textContent = destination.lastTestStatus === 'success'
      ? payload.latestUpload?.status === 'success'
        ? `Última cópia concluída em ${formatDeviceMoment(payload.latestUpload.completedAt)}`
        : payload.latestUpload?.status === 'failed'
          ? 'Conexão validada · último envio falhou'
          : payload.latestUpload?.status === 'uploading'
            ? 'Conexão validada · envio em andamento'
            : `Conexão validada em ${formatDeviceMoment(destination.lastTestAt)}`
      : destination.lastTestStatus === 'failed' ? 'Último teste falhou' : destination.enabled ? 'Teste pendente' : 'Desativado';
  } catch (error) {
    setFormFeedback(platformBackupDestinationFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  }
}

platformBackupDestinationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setFormFeedback(platformBackupDestinationFeedback, '');
  setButtonLoading(savePlatformBackupDestinationButton, true);
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/backup-destination`, {
      method: 'PUT', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: backupDriveEnabled.checked, folderId: backupDriveFolderId.value.trim(),
        serviceAccountJson: backupDriveCredentials.value.trim(), encryptionPassphrase: backupDrivePassphrase.value,
        retentionDays: Number(backupDriveRetention.value) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error === 'backup_passphrase_too_short'
      ? 'A frase de recuperação deve ter pelo menos 20 caracteres.' : 'Não foi possível salvar o destino externo.');
    setFormFeedback(platformBackupDestinationFeedback, 'Destino salvo. Execute o teste antes do primeiro envio.');
    await loadPlatformBackupDestination();
  } catch (error) {
    setFormFeedback(platformBackupDestinationFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  } finally { setButtonLoading(savePlatformBackupDestinationButton, false); }
});

testPlatformBackupDestinationButton.addEventListener('click', async () => {
  testPlatformBackupDestinationButton.disabled = true;
  setFormFeedback(platformBackupDestinationFeedback, 'Testando autenticação e permissão de escrita…');
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/backup-destination/test`, { method: 'POST', headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Não foi possível acessar a pasta informada.');
    setFormFeedback(platformBackupDestinationFeedback, `Conexão validada com a pasta “${payload.folder.name}”.`);
    await loadPlatformBackupDestination();
  } catch (error) {
    setFormFeedback(platformBackupDestinationFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  } finally { testPlatformBackupDestinationButton.disabled = false; }
});

createTenantBackupButton.addEventListener('click', async () => {
  createTenantBackupButton.disabled = true;
  setFormFeedback(tenantBackupFeedback, 'Solicitando snapshot do cliente…');
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/backups`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendToGoogleDrive: tenantBackupGoogleDrive.checked })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error === 'tenant_backup_already_running'
      ? 'Já existe um backup deste cliente em processamento.'
      : payload.error === 'google_drive_not_available' ? 'O Google Drive da plataforma não está disponível.'
        : 'Não foi possível iniciar o backup.');
    setFormFeedback(tenantBackupFeedback, 'Backup colocado na fila. A tela será atualizada automaticamente.');
    await loadTenantBackups();
  } catch (error) {
    setFormFeedback(tenantBackupFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  } finally { createTenantBackupButton.disabled = false; }
});

function createAlertChannelDrafts() {
  return {
    generic: { credential: '', telegramChatId: '' },
    discord: { credential: '', telegramChatId: '' },
    telegram: { credential: '', telegramChatId: '' }
  };
}

function storeActiveAlertChannelDraft() {
  const draft = alertChannelDrafts[activeAlertDestinationType];
  if (!draft) return;
  draft.credential = alertSettingsForm.elements.credential.value;
  draft.telegramChatId = alertSettingsForm.elements.telegramChatId.value;
}

function displayAlertChannel(type, credentialConfigured = false) {
  const draft = alertChannelDrafts[type] || { credential: '', telegramChatId: '' };
  activeAlertDestinationType = type;
  alertSettingsForm.elements.credential.value = draft.credential;
  alertSettingsForm.elements.telegramChatId.value = draft.telegramChatId;
  updateAlertDestinationFields(credentialConfigured);
}

function alertChannelName(type) {
  return { generic: 'Webhook', discord: 'Discord', telegram: 'Telegram' }[type] || 'Canal externo';
}

function alertReminderLabel(minutes) {
  return {
    15: 'a cada 15 minutos', 30: 'a cada 30 minutos', 60: 'a cada 1 hora', 180: 'a cada 3 horas',
    360: 'a cada 6 horas', 1440: 'a cada 24 horas', 10080: 'a cada 7 dias'
  }[Number(minutes)] || `a cada ${minutes} minutos`;
}

function alertSourceNames(sources) {
  const labels = { device: 'Equipamentos', collector: 'Coletores', spool: 'Fila local', parser: 'Parsing', backup: 'Backups', server: 'Servidores', continuity: 'Continuidade' };
  return sources.map((source) => labels[source] || source);
}

function alertDestinationDescription(type, credential, telegramChatId) {
  if (type === 'telegram') {
    return `Token: ${credential || 'não informado'} · Chat ID: ${telegramChatId || 'não informado'}`;
  }
  return credential || 'URL ainda não informada';
}

function alertSummaryArticle(label, value, detail) {
  const article = document.createElement('article');
  const labelElement = document.createElement('span');
  const valueElement = document.createElement('strong');
  const detailElement = document.createElement('small');
  labelElement.textContent = label;
  valueElement.textContent = value;
  detailElement.textContent = detail;
  article.append(labelElement, valueElement, detailElement);
  return article;
}

function alertChannelIcon(type) {
  const icon = document.createElement('span');
  icon.className = 'alert-overview-icon';
  const svg = svgNode('svg', { 'aria-hidden': 'true' });
  if (type === 'discord') svg.classList.add('brand-fill');
  const use = svgNode('use', { href: type === 'discord' ? '#icon-discord' : type === 'telegram' ? '#icon-send' : '#icon-plug' });
  svg.append(use);
  icon.append(svg);
  return icon;
}

function renderAlertSettings(settings) {
  alertNotificationSettings = settings;
  alertSettingsList.replaceChildren();
  alertSettingsEmpty.hidden = settings.length !== 0;
  alertSettingsList.hidden = settings.length === 0;
  configureAlertsButton.disabled = settings.length >= 3;
  configureAlertsButton.title = settings.length >= 3
    ? 'Webhook, Discord e Telegram já estão configurados. Use Editar para alterar um canal.' : '';
  alertSettingsUpdated.textContent = settings.length === 1 ? '1 canal cadastrado' : `${settings.length} canais cadastrados`;
  const canManage = !isPlatformContext() || hasPlatformPermission('alerts', 'manage');

  for (const setting of settings) {
    const overview = document.createElement('article');
    overview.className = 'alert-notification-overview';
    overview.dataset.alertSettingId = setting.id;

    const head = document.createElement('div');
    head.className = 'alert-overview-head';
    const identity = document.createElement('div');
    identity.className = 'alert-overview-identity';
    const identityCopy = document.createElement('div');
    const channel = document.createElement('strong');
    const status = document.createElement('small');
    channel.textContent = alertChannelName(setting.destinationType);
    status.textContent = setting.enabled ? 'Notificações ativas' : 'Notificações desativadas';
    status.classList.toggle('active', setting.enabled);
    identityCopy.append(channel, status);
    identity.append(alertChannelIcon(setting.destinationType), identityCopy);

    const actions = document.createElement('div');
    actions.className = 'alert-overview-actions';
    const testButton = document.createElement('button');
    testButton.className = 'secondary-button';
    testButton.type = 'button';
    testButton.dataset.alertAction = 'test';
    testButton.textContent = 'Enviar teste';
    testButton.disabled = !setting.credentialConfigured;
    const editButton = document.createElement('button');
    editButton.className = 'secondary-button';
    editButton.type = 'button';
    editButton.dataset.alertAction = 'edit';
    editButton.textContent = 'Editar';
    const deleteButton = document.createElement('button');
    deleteButton.className = 'secondary-button alert-delete-button';
    deleteButton.type = 'button';
    deleteButton.dataset.alertAction = 'delete';
    deleteButton.textContent = 'Excluir';
    if (canManage) actions.append(testButton, editButton, deleteButton);
    else {
      const readOnly = document.createElement('span');
      readOnly.className = 'access-profile-read-only';
      readOnly.textContent = 'Somente visualização';
      actions.append(readOnly);
    }
    head.append(identity, actions);

    const summary = document.createElement('div');
    summary.className = 'alert-summary-grid';
    summary.append(
      alertSummaryArticle('DESTINO', alertDestinationDescription(
        setting.destinationType, setting.credential || '', setting.telegramChatId || ''
      ), setting.lastTestAt
        ? `${setting.lastTestStatus === 'success' ? 'último teste aprovado' : 'último teste falhou'} · ${formatDeviceMoment(setting.lastTestAt)}`
        : 'canal ainda não testado'),
      alertSummaryArticle('POLÍTICA', `${setting.minimumSeverity === 'warning' ? 'Avisos e críticos' : 'Somente críticos'} · ${alertReminderLabel(setting.reminderMinutes)}`,
        setting.recoveryEnabled ? 'avisa quando voltar ao normal' : 'não avisa quando voltar ao normal'),
      alertSummaryArticle('ORIGENS', alertSourceNames(setting.enabledSources).join(', ') || 'Nenhuma origem selecionada',
        'ocorrências enviadas por este canal')
    );
    overview.append(head, summary);
    alertSettingsList.append(overview);
  }
}

function setAlertChannelAvailability(selectedType, editing) {
  const configuredTypes = new Set(alertNotificationSettings.map((settings) => settings.destinationType));
  for (const input of alertDestinationInputs) {
    const unavailable = editing ? input.value !== selectedType : configuredTypes.has(input.value);
    input.disabled = unavailable;
    input.closest('.alert-channel-option')?.classList.toggle('unavailable', unavailable);
  }
}

function fillAlertSettingsForm(settings) {
  editingAlertSettingId = settings.id;
  alertWizardTitle.textContent = `Editar ${alertChannelName(settings.destinationType)}`;
  alertSettingsForm.elements.enabled.checked = settings.enabled;
  alertSettingsForm.elements.destinationType.value = settings.destinationType;
  alertChannelDrafts = createAlertChannelDrafts();
  alertChannelDrafts[settings.destinationType] = {
    credential: settings.credential || '',
    telegramChatId: settings.telegramChatId || ''
  };
  configuredAlertDestinationType = settings.credentialConfigured ? settings.destinationType : null;
  displayAlertChannel(settings.destinationType, settings.credentialConfigured);
  alertSettingsForm.elements.minimumSeverity.value = settings.minimumSeverity;
  alertSettingsForm.elements.reminderMinutes.value = String(settings.reminderMinutes);
  alertSettingsForm.elements.recoveryEnabled.checked = settings.recoveryEnabled;
  for (const checkbox of alertSettingsForm.querySelectorAll('input[name="source"]')) {
    checkbox.checked = settings.enabledSources.includes(checkbox.value);
  }
  setAlertChannelAvailability(settings.destinationType, true);
  updateAlertMasterState();
}

function prepareNewAlertSettings() {
  const configuredTypes = new Set(alertNotificationSettings.map((settings) => settings.destinationType));
  const destinationType = ['generic', 'discord', 'telegram'].find((type) => !configuredTypes.has(type));
  if (!destinationType) return false;
  editingAlertSettingId = null;
  alertWizardTitle.textContent = 'Configurar novo canal';
  alertChannelDrafts = createAlertChannelDrafts();
  configuredAlertDestinationType = null;
  alertSettingsForm.elements.enabled.checked = false;
  alertSettingsForm.elements.destinationType.value = destinationType;
  alertSettingsForm.elements.minimumSeverity.value = 'warning';
  alertSettingsForm.elements.reminderMinutes.value = '60';
  alertSettingsForm.elements.recoveryEnabled.checked = true;
  for (const checkbox of alertSettingsForm.querySelectorAll('input[name="source"]')) checkbox.checked = true;
  setAlertChannelAvailability(destinationType, false);
  displayAlertChannel(destinationType, false);
  updateAlertMasterState();
  return true;
}

function updateAlertMasterState() {
  const enabled = alertSettingsForm.elements.enabled.checked;
  alertMasterState.textContent = enabled ? 'Ativadas' : 'Desativadas';
  alertMasterState.classList.toggle('active', enabled);
}

function updateAlertDestinationFields(credentialConfigured = false) {
  const type = alertSettingsForm.elements.destinationType.value || 'generic';
  alertTelegramChatField.hidden = type !== 'telegram';
  alertCredentialLabel.textContent = type === 'telegram' ? 'Token do bot' : type === 'discord' ? 'URL do webhook do Discord' : 'URL do webhook';
  alertCredential.placeholder = type === 'telegram' ? '123456789:token-do-bot' : type === 'discord' ? 'https://discord.com/api/webhooks/…' : 'https://automacao.exemplo/logvault';
  alertCredentialHelp.textContent = credentialConfigured
    ? 'Credencial configurada e visível somente para administradores autenticados.'
    : type === 'telegram'
      ? 'Informe o token fornecido pelo BotFather.'
      : type === 'discord' ? 'Cole a URL exclusiva do webhook do canal.' : 'Informe a URL HTTP que receberá os alertas.';
}

alertDestinationInputs.forEach((input) => input.addEventListener('change', () => {
  storeActiveAlertChannelDraft();
  displayAlertChannel(input.value, input.value === configuredAlertDestinationType);
}));
alertSettingsForm.elements.enabled.addEventListener('change', updateAlertMasterState);

function renderAlertWizardReview() {
  storeActiveAlertChannelDraft();
  const type = alertSettingsForm.elements.destinationType.value;
  const minimumSeverity = alertSettingsForm.elements.minimumSeverity.value;
  const enabledSources = [...alertSettingsForm.querySelectorAll('input[name="source"]:checked')].map((item) => item.value);
  alertReviewChannel.textContent = alertChannelName(type);
  alertReviewDestination.textContent = alertDestinationDescription(
    type, alertSettingsForm.elements.credential.value.trim(), alertSettingsForm.elements.telegramChatId.value.trim()
  );
  alertReviewPolicy.textContent = `${minimumSeverity === 'warning' ? 'Avisos e críticos' : 'Somente críticos'} · ${alertReminderLabel(alertSettingsForm.elements.reminderMinutes.value)}`;
  alertReviewRecovery.textContent = alertSettingsForm.elements.recoveryEnabled.checked
    ? 'Avisará quando voltar ao normal' : 'Não avisará quando voltar ao normal';
  alertReviewSources.textContent = alertSourceNames(enabledSources).join(', ') || 'Nenhuma origem selecionada';
}

function setAlertWizardStep(step) {
  alertWizardStep = Math.max(1, Math.min(4, step));
  alertWizardSteps.forEach((panel) => { panel.hidden = Number(panel.dataset.alertStep) !== alertWizardStep; });
  alertWizardIndicators.forEach((indicator) => {
    const indicatorStep = Number(indicator.dataset.alertStepIndicator);
    indicator.classList.toggle('active', indicatorStep === alertWizardStep);
    indicator.classList.toggle('completed', indicatorStep < alertWizardStep);
  });
  alertWizardBackButton.hidden = alertWizardStep === 1;
  alertWizardNextButton.hidden = alertWizardStep === 4;
  saveAlertSettingsButton.hidden = alertWizardStep !== 4;
  setFormFeedback(alertSettingsFeedback, '');
  if (alertWizardStep === 4) renderAlertWizardReview();
}

function validateAlertWizardStep() {
  if (alertWizardStep === 1) {
    const type = alertSettingsForm.elements.destinationType.value;
    const credential = alertSettingsForm.elements.credential.value.trim();
    if (!credential) {
      setFormFeedback(alertSettingsFeedback, type === 'telegram' ? 'Informe o token do bot.' : 'Informe a URL do webhook.', true);
      return false;
    }
    if (type !== 'telegram') {
      try {
        const url = new URL(credential);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid_protocol');
      } catch {
        setFormFeedback(alertSettingsFeedback, 'Informe uma URL HTTP ou HTTPS válida.', true);
        return false;
      }
    }
    if (type === 'telegram' && !alertSettingsForm.elements.telegramChatId.value.trim()) {
      setFormFeedback(alertSettingsFeedback, 'Informe o Chat ID do Telegram.', true);
      return false;
    }
  }
  if (alertWizardStep === 3 && !alertSettingsForm.querySelector('input[name="source"]:checked')) {
    setFormFeedback(alertSettingsFeedback, 'Selecione pelo menos uma origem de alerta.', true);
    return false;
  }
  return true;
}

async function openAlertSettingsWizard(triggerButton, settingId = null) {
  triggerButton.disabled = true;
  setFormFeedback(alertTestFeedback, '');
  try {
    await loadAlertSettings();
    if (settingId) {
      const settings = alertNotificationSettings.find((candidate) => candidate.id === settingId);
      if (!settings) throw new Error('A configuração selecionada não foi encontrada.');
      fillAlertSettingsForm(settings);
    } else if (!prepareNewAlertSettings()) {
      setFormFeedback(alertTestFeedback, 'Todos os canais disponíveis já estão configurados. Use Editar para alterar um deles.');
      return;
    }
    setAlertWizardStep(1);
    alertSettingsDialog.showModal();
  } catch (error) {
    setFormFeedback(alertTestFeedback, error instanceof Error ? error.message : 'Não foi possível abrir a configuração.', true);
  } finally {
    triggerButton.disabled = triggerButton === configureAlertsButton && alertNotificationSettings.length >= 3;
  }
}

configureAlertsButton.addEventListener('click', () => void openAlertSettingsWizard(configureAlertsButton));

closeAlertWizardButton.addEventListener('click', () => alertSettingsDialog.close());
alertWizardBackButton.addEventListener('click', () => setAlertWizardStep(alertWizardStep - 1));
alertWizardNextButton.addEventListener('click', () => {
  if (validateAlertWizardStep()) setAlertWizardStep(alertWizardStep + 1);
});

async function loadAlertSettings() {
  alertSettingsPanel.hidden = isPlatformContext() || currentUser?.role !== 'admin';
  if (alertSettingsPanel.hidden) return;
  const response = await authenticatedFetch(`${API_BASE}/v1/system/alert-settings`, {
    headers: { Accept: 'application/json' }, cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Não foi possível carregar as configurações de alertas.');
  renderAlertSettings(payload.settings);
}

alertSettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (alertWizardStep !== 4) {
    if (validateAlertWizardStep()) setAlertWizardStep(alertWizardStep + 1);
    return;
  }
  const enabledSources = [...alertSettingsForm.querySelectorAll('input[name="source"]:checked')].map((item) => item.value);
  if (!enabledSources.length) {
    setFormFeedback(alertSettingsFeedback, 'Selecione pelo menos um tipo de ocorrência.', true);
    return;
  }
  saveAlertSettingsButton.disabled = true;
  saveAlertSettingsButton.classList.add('loading');
  setFormFeedback(alertSettingsFeedback, '');
  try {
    const endpoint = editingAlertSettingId
      ? `${API_BASE}/v1/system/alert-settings/${encodeURIComponent(editingAlertSettingId)}`
      : `${API_BASE}/v1/system/alert-settings`;
    const response = await authenticatedFetch(endpoint, {
      method: editingAlertSettingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        enabled: alertSettingsForm.elements.enabled.checked,
        destinationType: alertSettingsForm.elements.destinationType.value,
        credential: alertSettingsForm.elements.credential.value.trim(),
        telegramChatId: alertSettingsForm.elements.telegramChatId.value.trim(),
        minimumSeverity: alertSettingsForm.elements.minimumSeverity.value,
        enabledSources,
        reminderMinutes: Number(alertSettingsForm.elements.reminderMinutes.value),
        recoveryEnabled: alertSettingsForm.elements.recoveryEnabled.checked
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 409
      ? 'Este canal já está configurado. Use Editar no cartão correspondente.'
      : response.status === 400 ? 'Revise o destino, a credencial e as opções selecionadas.' : 'Não foi possível salvar os alertas.');
    alertSettingsDialog.close();
    await loadAlertSettings();
    setFormFeedback(alertTestFeedback, payload.settings.enabled ? 'Notificações externas ativadas.' : 'Configuração salva; notificações externas desativadas.');
  } catch (error) {
    setFormFeedback(alertSettingsFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  } finally {
    saveAlertSettingsButton.disabled = false;
    saveAlertSettingsButton.classList.remove('loading');
  }
});

async function testAlertSetting(settingId, button) {
  button.disabled = true;
  setFormFeedback(alertTestFeedback, 'Enviando mensagem de teste…');
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/system/alert-settings/${encodeURIComponent(settingId)}/test`, {
      method: 'POST', headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || (response.status === 409
      ? 'Salve o destino e a credencial antes de testar.' : 'O destino recusou a mensagem de teste.'));
    setFormFeedback(alertTestFeedback, 'Mensagem de teste entregue com sucesso.');
    await loadAlertSettings();
  } catch (error) {
    setFormFeedback(alertTestFeedback, error instanceof Error ? error.message : 'Falha no teste.', true);
  } finally {
    button.disabled = false;
  }
}

async function deleteAlertSetting(settingId, button) {
  const settings = alertNotificationSettings.find((candidate) => candidate.id === settingId);
  if (!settings || !window.confirm(`Excluir a configuração do ${alertChannelName(settings.destinationType)}?`)) return;
  button.disabled = true;
  setFormFeedback(alertTestFeedback, 'Excluindo configuração…');
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/system/alert-settings/${encodeURIComponent(settingId)}`, {
      method: 'DELETE', headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Não foi possível excluir a configuração.');
    await loadAlertSettings();
    setFormFeedback(alertTestFeedback, `${alertChannelName(settings.destinationType)} removido com sucesso.`);
  } catch (error) {
    setFormFeedback(alertTestFeedback, error instanceof Error ? error.message : 'Falha ao excluir.', true);
  } finally {
    button.disabled = false;
  }
}

alertSettingsList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-alert-action]');
  const settingId = button?.closest('[data-alert-setting-id]')?.dataset.alertSettingId;
  if (!button || !settingId) return;
  if (button.dataset.alertAction === 'test') void testAlertSetting(settingId, button);
  if (button.dataset.alertAction === 'edit') void openAlertSettingsWizard(button, settingId);
  if (button.dataset.alertAction === 'delete') void deleteAlertSetting(settingId, button);
});

async function loadSystem() {
  if (tenantBackupPollTimer) window.clearTimeout(tenantBackupPollTimer);
  tenantBackupPollTimer = null;
  const platformContext = isPlatformContext();
  platformBackupDestinationPanel.hidden = !platformContext;
  tenantBackupPanel.hidden = platformContext;
  if (platformContext) {
    const canManageBackups = hasPlatformPermission('system', 'manage');
    [...platformBackupDestinationForm.elements].forEach((element) => { element.disabled = !canManageBackups; });
    testPlatformBackupDestinationButton.disabled = !canManageBackups;
    savePlatformBackupDestinationButton.disabled = !canManageBackups;
  } else {
    createTenantBackupButton.hidden = currentUser?.role !== 'admin';
    tenantBackupGoogleDrive.closest('label').hidden = currentUser?.role !== 'admin';
  }
  systemLoading.hidden = false;
  systemError.hidden = true;
  systemServiceList.hidden = true;
  refreshSystemButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/system/status`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('O serviço de monitoramento não respondeu corretamente.');
    renderSystemServices(payload);
    systemGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    if (payload.backup.latest) {
      systemLastBackup.textContent = formatDeviceMoment(payload.backup.latest.createdAt);
      systemBackupDetail.textContent = `PostgreSQL, ClickHouse${payload.backup.latest.collectorIncluded ? ' e spool local' : ''}`;
    } else {
      systemLastBackup.textContent = 'Pendente';
      systemBackupDetail.textContent = 'nenhuma execução concluída';
    }
    backupPolicy.textContent = payload.backup.scope === 'tenant'
      ? 'Snapshot lógico sob demanda · download disponível por 7 dias'
      : `A cada ${payload.backup.expectedEveryHours}h · retenção ${payload.backup.retentionDays} dias`;
    backupRemote.textContent = payload.backup.scope === 'tenant'
      ? 'Somente dados deste cliente; segredos e credenciais são excluídos'
      : !payload.backup.remote.enabled
        ? 'Cópia externa não configurada'
        : payload.backup.remote.status === 'ok'
          ? `Cópia externa atualizada · ${payload.backup.remote.lastBackupId}`
          : payload.backup.remote.status === 'failed' ? 'Falha na cópia externa' : 'Cópia externa pendente';
    renderBackups(payload.backup.recent, payload.backup.downloadAllowed);
    backupEmpty.hidden = payload.backup.recent.length !== 0;
    backupTableWrap.hidden = payload.backup.recent.length === 0;
    systemLoaded = true;
    systemLoading.hidden = true;
    systemServiceList.hidden = false;
    if (platformContext) await loadPlatformBackupDestination();
    else await loadTenantBackups();
  } catch (error) {
    systemLoading.hidden = true;
    if (!appShell.hidden) {
      systemError.hidden = false;
      systemErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshSystemButton.disabled = false;
  }
}

async function loadAlerts() {
  alertsLoading.hidden = false;
  alertsError.hidden = true;
  alertsOk.hidden = true;
  alertsWrap.hidden = true;
  refreshAlertsButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/system/status`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('O serviço de monitoramento não respondeu corretamente.');
    alertsOverall.textContent = systemStatusLabel(payload.status);
    alertsOverall.className = `system-overall-${payload.status}`;
    alertsCritical.textContent = formatNumber(payload.summary.critical);
    alertsWarning.textContent = formatNumber(payload.summary.warning);
    alertsTotal.textContent = formatNumber(payload.alerts.length);
    alertsGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    renderSystemAlerts(payload.alerts);
    alertsOk.hidden = payload.alerts.length !== 0;
    alertsWrap.hidden = payload.alerts.length === 0;
    alertsLoaded = true;
    alertsLoading.hidden = true;
    try {
      await loadAlertSettings();
    } catch (error) {
      setFormFeedback(alertTestFeedback, error instanceof Error ? error.message : 'Falha ao carregar as notificações externas.', true);
    }
  } catch (error) {
    alertsLoading.hidden = true;
    if (!appShell.hidden) {
      alertsError.hidden = false;
      alertsErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshAlertsButton.disabled = false;
  }
}

function serverStatusLabel(status) {
  return {
    healthy: 'Saudável',
    warning: 'Atenção',
    critical: 'Crítico',
    offline: 'Offline',
    collecting: 'Coletando',
    disabled: 'Desativado',
    not_implemented: 'Não implementado'
  }[status] || status;
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return 'Aguardando leitura';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${formatNumber(days)} dia(s) e ${formatNumber(hours)} h`;
  if (hours > 0) return `${formatNumber(hours)} h e ${formatNumber(minutes)} min`;
  return `${formatNumber(minutes)} min`;
}

function serverResourceTone(percent, warning, critical) {
  if (!Number.isFinite(percent)) return '';
  if (percent >= critical) return 'critical';
  if (percent >= warning) return 'warning';
  return '';
}

function serverResource(label, iconId, resource, warning, critical, detail) {
  const rawPercent = resource?.usagePercent;
  const percent = rawPercent === null || rawPercent === undefined ? Number.NaN : Number(rawPercent);
  const measured = Number.isFinite(percent);
  const wrapper = document.createElement('div');
  wrapper.className = `server-resource ${serverResourceTone(percent, warning, critical)}`.trim();
  const head = document.createElement('div');
  head.className = 'server-resource-head';
  const name = document.createElement('span');
  name.className = 'server-resource-name';
  const icon = svgNode('svg', { 'aria-hidden': 'true' });
  icon.append(svgNode('use', { href: iconId }));
  name.append(icon, document.createTextNode(label));
  const value = document.createElement('strong');
  value.textContent = measured ? `${formatRate(percent)}%` : '—';
  head.append(name, value);
  const bar = document.createElement('div');
  bar.className = 'server-resource-bar';
  const fill = document.createElement('i');
  fill.style.width = `${measured ? Math.max(0, Math.min(100, percent)) : 0}%`;
  bar.append(fill);
  const copy = document.createElement('small');
  copy.textContent = measured ? detail : 'Aguardando telemetria';
  wrapper.append(head, bar, copy);
  return wrapper;
}

function renderServers(servers, thresholds) {
  serversList.replaceChildren();
  let firstCollector = true;
  for (const server of servers) {
    const card = document.createElement('article');
    card.className = `server-health-card ${server.collectorId ? 'collector' : 'infrastructure'} ${server.status}${server.collectorId && firstCollector ? ' collector-first' : ''}`;
    if (server.collectorId) firstCollector = false;
    const head = document.createElement('div');
    head.className = 'server-health-head';
    const identity = document.createElement('div');
    identity.className = 'server-health-identity';
    const location = document.createElement('span');
    location.textContent = server.collectorId
      ? server.location === 'edge' ? 'Coletor local' : 'Coletor cloud'
      : `Infraestrutura · ${server.siteName || (server.infrastructureRole === 'standby' ? 'Data Center B' : 'Data Center A')}`;
    const name = document.createElement('strong');
    name.textContent = server.name;
    const platform = document.createElement('small');
    platform.textContent = server.status === 'not_implemented'
      ? 'DC-B ainda não cadastrado'
      : server.infrastructureRole === 'standby' && server.status === 'collecting'
        ? 'Aguardando inventário da VM'
        : server.platform || 'Sistema operacional não informado';
    identity.append(location, name);
    if (server.tenantName && server.collectorId) {
      const tenant = document.createElement('small');
      tenant.className = 'server-health-tenant';
      tenant.textContent = server.tenantName;
      identity.append(tenant);
    }
    identity.append(platform);
    const status = document.createElement('span');
    status.className = `server-health-status ${server.status}`;
    status.textContent = serverStatusLabel(server.status);
    head.append(identity, status);

    const resources = document.createElement('div');
    resources.className = 'server-resource-grid';
    resources.append(
      serverResource('CPU', '#icon-cpu', server.cpu, thresholds.cpuWarningPercent, thresholds.cpuCriticalPercent, 'uso atual do processador'),
      serverResource(
        'RAM', '#icon-memory', server.memory, thresholds.memoryWarningPercent, thresholds.memoryCriticalPercent,
        `${formatBytes(server.memory.usedBytes)} de ${formatBytes(server.memory.totalBytes)}`
      ),
      serverResource(
        'Armazenamento', '#icon-hard-drive', server.storage, thresholds.storageWarningPercent, thresholds.storageCriticalPercent,
        `${formatBytes(server.storage.usedBytes)} de ${formatBytes(server.storage.totalBytes)}`
      )
    );
    const hostedCollectors = document.createElement('div');
    hostedCollectors.className = 'server-hosted-collectors';
    if (Array.isArray(server.hostedCollectors) && server.hostedCollectors.length) {
      const hostedHead = document.createElement('div');
      hostedHead.className = 'server-hosted-head';
      const hostedTitle = document.createElement('strong');
      hostedTitle.textContent = 'Coletores Cloud hospedados';
      const hostedCount = document.createElement('span');
      hostedCount.textContent = formatNumber(server.hostedCollectors.length);
      hostedHead.append(hostedTitle, hostedCount);
      hostedCollectors.append(hostedHead);
      for (const collector of server.hostedCollectors.slice(0, 4)) {
        const row = document.createElement('div');
        row.className = 'server-hosted-row';
        const copy = document.createElement('p');
        const collectorName = document.createElement('strong');
        collectorName.textContent = collector.name;
        const collectorDetail = document.createElement('small');
        const ports = [collector.netflowPort ? `NetFlow ${collector.netflowPort}` : '', collector.syslogPort ? `Syslog ${collector.syslogPort}` : ''].filter(Boolean).join(' · ');
        collectorDetail.textContent = `${collector.tenantName ? `${collector.tenantName} · ` : ''}${ports || 'portas aguardando alocação'}`;
        copy.append(collectorName, collectorDetail);
        const placement = document.createElement('span');
        const effectivePlacement = collector.placement === 'active' && ['offline', 'disabled'].includes(collector.status)
          ? collector.status : collector.placement;
        placement.className = `server-hosted-placement ${effectivePlacement}`;
        placement.textContent = {
          active: 'Ativo', standby: 'Standby', not_implemented: 'Aguardando DC-B',
          offline: 'Offline', disabled: 'Desativado'
        }[effectivePlacement] || effectivePlacement;
        row.append(copy, placement);
        hostedCollectors.append(row);
      }
      if (server.hostedCollectors.length > 4) {
        const remaining = document.createElement('small');
        remaining.className = 'server-hosted-remaining';
        remaining.textContent = `+ ${formatNumber(server.hostedCollectors.length - 4)} coletor(es)`;
        hostedCollectors.append(remaining);
      }
    }
    const foot = document.createElement('div');
    foot.className = 'server-health-foot';
    const uptime = document.createElement('span');
    uptime.textContent = server.status === 'not_implemented'
      ? 'Aguardando implantação'
      : `Ligado há ${formatUptime(server.uptimeSeconds)}`;
    const update = document.createElement('span');
    update.textContent = server.status === 'not_implemented'
      ? 'Cadastre pelo menu Continuidade'
      : server.collectorId
      ? `Último heartbeat: ${formatDeviceMoment(server.lastSeenAt)}`
      : `Leitura: ${formatDeviceMoment(server.lastSeenAt)}`;
    foot.append(uptime, update);
    card.append(head, resources);
    if (hostedCollectors.childElementCount) card.append(hostedCollectors);
    card.append(foot);
    serversList.append(card);
  }
}

const serverHistorySeries = [
  { key: 'cpuUsagePercent', label: 'CPU', tone: 'cpu' },
  { key: 'memoryUsagePercent', label: 'RAM', tone: 'memory' },
  { key: 'storageUsagePercent', label: 'Armazenamento', tone: 'storage' }
];

const serverNetworkHistorySeries = [
  { key: 'networkReceivedBytesPerSecond', label: 'Entrada', tone: 'network-in' },
  { key: 'networkTransmittedBytesPerSecond', label: 'Saída', tone: 'network-out' }
];

const serverHistoryPeriodMilliseconds = {
  '5m': 5 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000
};

const serverHistoryBucketMilliseconds = {
  '5m': 10_000,
  '30m': 30_000,
  '1h': 60_000,
  '24h': 10 * 60_000
};

function serverHistoryNumber(value) {
  return value === null || value === undefined ? Number.NaN : Number(value);
}

function formatNetworkRate(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond)) return '—';
  const bitsPerSecond = Math.max(0, bytesPerSecond) * 8;
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
  let value = bitsPerSecond;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: digits })} ${units[unit]}`;
}

function svgNode(tag, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

function serverHistoryTimeLabel(value, period) {
  const options = period === '24h'
    ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
    : period === '5m'
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' };
  return new Intl.DateTimeFormat('pt-BR', options).format(new Date(value));
}

function renderServerHistorySummary(points) {
  serverHistorySummary.replaceChildren();
  for (const series of [...serverHistorySeries, ...serverNetworkHistorySeries]) {
    const values = points.map((point) => serverHistoryNumber(point[series.key])).filter(Number.isFinite);
    const article = document.createElement('article');
    article.className = series.tone;
    const label = document.createElement('span');
    label.textContent = series.label;
    const current = document.createElement('strong');
    const detail = document.createElement('small');
    if (values.length) {
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      if (serverNetworkHistorySeries.includes(series)) {
        current.textContent = formatNetworkRate(values[values.length - 1]);
        detail.textContent = `média ${formatNetworkRate(average)} · pico ${formatNetworkRate(Math.max(...values))}`;
      } else {
        current.textContent = `${formatRate(values[values.length - 1])}%`;
        detail.textContent = `média ${formatRate(average)}% · pico ${formatRate(Math.max(...values))}%`;
      }
    } else {
      current.textContent = '—';
      detail.textContent = 'sem amostras no período';
    }
    article.append(label, current, detail);
    serverHistorySummary.append(article);
  }
}

function renderServerNetworkHistoryChart(points, generatedAt, period) {
  const width = 1000;
  const height = 320;
  const plot = { left: 72, right: 978, top: 18, bottom: 278 };
  const endAt = new Date(generatedAt).getTime();
  const startAt = endAt - serverHistoryPeriodMilliseconds[period];
  const values = points.flatMap((point) => serverNetworkHistorySeries
    .map((series) => serverHistoryNumber(point[series.key]))
    .filter(Number.isFinite));
  const observedMaximum = values.length ? Math.max(...values) : 0;
  const axisMaximum = Math.max(1, observedMaximum * 1.1);
  const xAt = (value) => plot.left + Math.max(0, Math.min(1, (new Date(value).getTime() - startAt) / (endAt - startAt))) * (plot.right - plot.left);
  const yAt = (value) => plot.bottom - Math.max(0, Math.min(axisMaximum, value)) / axisMaximum * (plot.bottom - plot.top);
  serverNetworkHistoryChart.replaceChildren();

  for (const ratio of [1, .75, .5, .25, 0]) {
    const y = yAt(axisMaximum * ratio);
    serverNetworkHistoryChart.append(svgNode('line', { x1: plot.left, y1: y, x2: plot.right, y2: y, class: 'grid-line' }));
    const label = svgNode('text', { x: plot.left - 10, y: y + 4, class: 'axis-label', 'text-anchor': 'end' });
    label.textContent = formatNetworkRate(axisMaximum * ratio);
    serverNetworkHistoryChart.append(label);
  }
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const x = plot.left + ratio * (plot.right - plot.left);
    const label = svgNode('text', {
      x, y: height - 16, class: 'axis-label',
      'text-anchor': index === 0 ? 'start' : index === 4 ? 'end' : 'middle'
    });
    label.textContent = serverHistoryTimeLabel(startAt + ratio * (endAt - startAt), period);
    serverNetworkHistoryChart.append(label);
  }

  const maximumGap = serverHistoryBucketMilliseconds[period] * 2.5;
  for (const series of serverNetworkHistorySeries) {
    let path = '';
    let previousAt = null;
    let validPoints = 0;
    for (const point of points) {
      const value = serverHistoryNumber(point[series.key]);
      const sampledAt = new Date(point.sampledAt).getTime();
      if (!Number.isFinite(value) || !Number.isFinite(sampledAt)) {
        previousAt = null;
        continue;
      }
      const x = xAt(point.sampledAt);
      const y = yAt(value);
      path += previousAt === null || sampledAt - previousAt > maximumGap ? ` M ${x} ${y}` : ` L ${x} ${y}`;
      previousAt = sampledAt;
      validPoints += 1;
    }
    if (path) serverNetworkHistoryChart.append(svgNode('path', { d: path.trim(), class: `series-line ${series.tone}` }));
    if (validPoints === 1) {
      const point = points.find((candidate) => Number.isFinite(serverHistoryNumber(candidate[series.key])));
      if (point) serverNetworkHistoryChart.append(svgNode('circle', {
        cx: xAt(point.sampledAt), cy: yAt(serverHistoryNumber(point[series.key])), r: 3, class: `hover-point ${series.tone}`
      }));
    }
  }

  const hoverLine = svgNode('line', {
    x1: plot.left, y1: plot.top, x2: plot.left, y2: plot.bottom, class: 'hover-line', visibility: 'hidden'
  });
  serverNetworkHistoryChart.append(hoverLine);
  const hoverPoints = serverNetworkHistorySeries.map((series) => {
    const circle = svgNode('circle', { cx: plot.left, cy: plot.top, r: 4, class: `hover-point ${series.tone}`, visibility: 'hidden' });
    serverNetworkHistoryChart.append(circle);
    return circle;
  });
  const overlay = svgNode('rect', {
    x: plot.left, y: plot.top, width: plot.right - plot.left, height: plot.bottom - plot.top, fill: 'transparent'
  });
  serverNetworkHistoryChart.append(overlay);

  function hideNetworkTooltip() {
    hoverLine.setAttribute('visibility', 'hidden');
    hoverPoints.forEach((point) => point.setAttribute('visibility', 'hidden'));
    serverNetworkHistoryTooltip.hidden = true;
  }

  serverNetworkHistoryChart.onpointermove = (event) => {
    const bounds = serverNetworkHistoryChart.getBoundingClientRect();
    const cursorX = (event.clientX - bounds.left) / bounds.width * width;
    if (cursorX < plot.left || cursorX > plot.right) return hideNetworkTooltip();
    const targetAt = startAt + (cursorX - plot.left) / (plot.right - plot.left) * (endAt - startAt);
    const nearest = points.reduce((selected, point) => {
      if (!selected) return point;
      return Math.abs(new Date(point.sampledAt).getTime() - targetAt) < Math.abs(new Date(selected.sampledAt).getTime() - targetAt)
        ? point : selected;
    }, null);
    if (!nearest) return hideNetworkTooltip();
    const x = xAt(nearest.sampledAt);
    hoverLine.setAttribute('x1', String(x));
    hoverLine.setAttribute('x2', String(x));
    hoverLine.setAttribute('visibility', 'visible');
    serverNetworkHistorySeries.forEach((series, index) => {
      const value = serverHistoryNumber(nearest[series.key]);
      if (!Number.isFinite(value)) return hoverPoints[index].setAttribute('visibility', 'hidden');
      hoverPoints[index].setAttribute('cx', String(x));
      hoverPoints[index].setAttribute('cy', String(yAt(value)));
      hoverPoints[index].setAttribute('visibility', 'visible');
    });
    const title = document.createElement('strong');
    title.textContent = serverHistoryTimeLabel(nearest.sampledAt, period);
    const rates = document.createElement('span');
    rates.textContent = serverNetworkHistorySeries.map((series) => {
      const value = serverHistoryNumber(nearest[series.key]);
      return `${series.label}: ${formatNetworkRate(value)}`;
    }).join(' · ');
    serverNetworkHistoryTooltip.replaceChildren(title, rates);
    const xPixels = x / width * serverNetworkHistoryChart.clientWidth;
    serverNetworkHistoryTooltip.style.left = `${xPixels > serverNetworkHistoryChart.clientWidth - 165 ? xPixels - 155 : xPixels + 12}px`;
    serverNetworkHistoryTooltip.style.top = '26px';
    serverNetworkHistoryTooltip.hidden = false;
  };
  serverNetworkHistoryChart.onpointerleave = hideNetworkTooltip;
}

function renderServerHistoryChart(points, generatedAt, period) {
  const width = 1000;
  const height = 320;
  const plot = { left: 55, right: 978, top: 18, bottom: 278 };
  const endAt = new Date(generatedAt).getTime();
  const startAt = endAt - serverHistoryPeriodMilliseconds[period];
  const xAt = (value) => plot.left + Math.max(0, Math.min(1, (new Date(value).getTime() - startAt) / (endAt - startAt))) * (plot.right - plot.left);
  const yAt = (value) => plot.bottom - Math.max(0, Math.min(100, value)) / 100 * (plot.bottom - plot.top);
  serverHistoryChart.replaceChildren();

  for (const value of [100, 75, 50, 25, 0]) {
    const y = yAt(value);
    serverHistoryChart.append(svgNode('line', { x1: plot.left, y1: y, x2: plot.right, y2: y, class: 'grid-line' }));
    const label = svgNode('text', { x: plot.left - 10, y: y + 4, class: 'axis-label', 'text-anchor': 'end' });
    label.textContent = `${value}%`;
    serverHistoryChart.append(label);
  }
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const x = plot.left + ratio * (plot.right - plot.left);
    const label = svgNode('text', {
      x,
      y: height - 16,
      class: 'axis-label',
      'text-anchor': index === 0 ? 'start' : index === 4 ? 'end' : 'middle'
    });
    label.textContent = serverHistoryTimeLabel(startAt + ratio * (endAt - startAt), period);
    serverHistoryChart.append(label);
  }

  const maximumGap = serverHistoryBucketMilliseconds[period] * 2.5;
  for (const series of serverHistorySeries) {
    let path = '';
    let previousAt = null;
    let validPoints = 0;
    for (const point of points) {
      const value = serverHistoryNumber(point[series.key]);
      const sampledAt = new Date(point.sampledAt).getTime();
      if (!Number.isFinite(value) || !Number.isFinite(sampledAt)) {
        previousAt = null;
        continue;
      }
      const x = xAt(point.sampledAt);
      const y = yAt(value);
      path += previousAt === null || sampledAt - previousAt > maximumGap ? ` M ${x} ${y}` : ` L ${x} ${y}`;
      previousAt = sampledAt;
      validPoints += 1;
    }
    if (path) serverHistoryChart.append(svgNode('path', { d: path.trim(), class: `series-line ${series.tone}` }));
    if (validPoints === 1) {
      const point = points.find((candidate) => Number.isFinite(serverHistoryNumber(candidate[series.key])));
      if (point) serverHistoryChart.append(svgNode('circle', {
        cx: xAt(point.sampledAt), cy: yAt(serverHistoryNumber(point[series.key])), r: 3, class: `hover-point ${series.tone}`
      }));
    }
  }

  const hoverLine = svgNode('line', {
    x1: plot.left, y1: plot.top, x2: plot.left, y2: plot.bottom, class: 'hover-line', visibility: 'hidden'
  });
  serverHistoryChart.append(hoverLine);
  const hoverPoints = serverHistorySeries.map((series) => {
    const circle = svgNode('circle', { cx: plot.left, cy: plot.top, r: 4, class: `hover-point ${series.tone}`, visibility: 'hidden' });
    serverHistoryChart.append(circle);
    return circle;
  });
  const overlay = svgNode('rect', {
    x: plot.left, y: plot.top, width: plot.right - plot.left, height: plot.bottom - plot.top, fill: 'transparent'
  });
  serverHistoryChart.append(overlay);

  function hideServerHistoryTooltip() {
    hoverLine.setAttribute('visibility', 'hidden');
    hoverPoints.forEach((point) => point.setAttribute('visibility', 'hidden'));
    serverHistoryTooltip.hidden = true;
  }

  serverHistoryChart.onpointermove = (event) => {
    const bounds = serverHistoryChart.getBoundingClientRect();
    const cursorX = (event.clientX - bounds.left) / bounds.width * width;
    if (cursorX < plot.left || cursorX > plot.right) return hideServerHistoryTooltip();
    const targetAt = startAt + (cursorX - plot.left) / (plot.right - plot.left) * (endAt - startAt);
    const nearest = points.reduce((selected, point) => {
      if (!selected) return point;
      return Math.abs(new Date(point.sampledAt).getTime() - targetAt) < Math.abs(new Date(selected.sampledAt).getTime() - targetAt)
        ? point
        : selected;
    }, null);
    if (!nearest) return hideServerHistoryTooltip();
    const x = xAt(nearest.sampledAt);
    hoverLine.setAttribute('x1', String(x));
    hoverLine.setAttribute('x2', String(x));
    hoverLine.setAttribute('visibility', 'visible');
    serverHistorySeries.forEach((series, index) => {
      const value = serverHistoryNumber(nearest[series.key]);
      if (!Number.isFinite(value)) return hoverPoints[index].setAttribute('visibility', 'hidden');
      hoverPoints[index].setAttribute('cx', String(x));
      hoverPoints[index].setAttribute('cy', String(yAt(value)));
      hoverPoints[index].setAttribute('visibility', 'visible');
    });
    const title = document.createElement('strong');
    title.textContent = serverHistoryTimeLabel(nearest.sampledAt, period);
    const values = document.createElement('span');
    values.textContent = serverHistorySeries.map((series) => {
      const value = serverHistoryNumber(nearest[series.key]);
      return `${series.label}: ${Number.isFinite(value) ? `${formatRate(value)}%` : '—'}`;
    }).join(' · ');
    serverHistoryTooltip.replaceChildren(title, values);
    const xPixels = x / width * serverHistoryChart.clientWidth;
    serverHistoryTooltip.style.left = `${xPixels > serverHistoryChart.clientWidth - 165 ? xPixels - 155 : xPixels + 12}px`;
    serverHistoryTooltip.style.top = '26px';
    serverHistoryTooltip.hidden = false;
  };
  serverHistoryChart.onpointerleave = hideServerHistoryTooltip;
}

function syncServerHistoryOptions(servers) {
  const previous = serverHistoryServer.value;
  availableServers = servers.filter((server) => server.historyAvailable !== false);
  serverHistoryServer.replaceChildren();
  for (const server of availableServers) {
    const option = document.createElement('option');
    option.value = server.id;
    option.textContent = server.collectorId
      ? `${server.name}${server.tenantName ? ` · ${server.tenantName}` : ''} · ${server.location === 'edge' ? 'local' : 'nuvem'}`
      : `${server.name} · ${server.siteName || (server.infrastructureRole === 'standby' ? 'Data Center B' : 'Data Center A')}`;
    serverHistoryServer.append(option);
  }
  const selected = availableServers.some((server) => server.id === previous) ? previous : availableServers[0]?.id || '';
  serverHistoryServer.value = selected;
  serverHistoryServer.disabled = availableServers.length === 0;
  return selected !== previous;
}

async function loadServerHistory(reset = false) {
  const serverId = serverHistoryServer.value;
  if (!serverId) return;
  const request = ++serverHistoryRequest;
  if (reset || serverHistoryContent.hidden && serverHistoryEmpty.hidden) {
    serverHistoryContent.hidden = true;
    serverHistoryEmpty.hidden = true;
    serverHistoryLoading.hidden = false;
  }
  serverHistoryError.hidden = true;
  serverHistoryServer.disabled = true;
  serverHistoryPeriodButtons.forEach((button) => { button.disabled = true; });
  try {
    const query = new URLSearchParams({ serverId, period: serverHistoryPeriod });
    const response = await authenticatedFetch(`${API_BASE}/v1/servers/history?${query}`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('O histórico de recursos não respondeu corretamente.');
    if (request !== serverHistoryRequest) return;
    serverHistoryLoading.hidden = true;
    if (!Array.isArray(payload.points) || payload.points.length === 0) {
      serverHistoryContent.hidden = true;
      serverHistoryEmpty.hidden = false;
      return;
    }
    serverHistoryEmpty.hidden = true;
    renderServerHistorySummary(payload.points);
    renderServerHistoryChart(payload.points, payload.generatedAt, payload.period);
    renderServerNetworkHistoryChart(payload.points, payload.generatedAt, payload.period);
    serverHistoryUpdated.textContent = `${payload.server.name}${payload.server.tenantName ? ` · ${payload.server.tenantName}` : ''} · atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    serverHistoryContent.hidden = false;
  } catch (error) {
    if (request !== serverHistoryRequest) return;
    serverHistoryLoading.hidden = true;
    if (serverHistoryContent.hidden) {
      serverHistoryEmpty.hidden = true;
      serverHistoryError.hidden = false;
      serverHistoryErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    } else {
      serverHistoryUpdated.textContent = 'Não foi possível atualizar o histórico agora.';
    }
  } finally {
    if (request === serverHistoryRequest) {
      serverHistoryServer.disabled = availableServers.length === 0;
      serverHistoryPeriodButtons.forEach((button) => { button.disabled = false; });
    }
  }
}

async function loadServers() {
  if (serversPollTimer) window.clearTimeout(serversPollTimer);
  serversPollTimer = null;
  serversLoading.hidden = false;
  serversError.hidden = true;
  serversList.hidden = true;
  refreshServersButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/servers/status`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('O serviço de saúde dos servidores não respondeu corretamente.');
    serverTotal.textContent = formatNumber(payload.summary.total);
    serverHealthy.textContent = formatNumber(payload.summary.healthy);
    serverAttention.textContent = formatNumber(payload.summary.attention);
    serverOffline.textContent = formatNumber(payload.summary.offline);
    serversGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    renderServers(payload.servers, payload.thresholds);
    const historySelectionChanged = syncServerHistoryOptions(payload.servers);
    void loadServerHistory(historySelectionChanged);
    serversLoading.hidden = true;
    serversList.hidden = false;
    serversLoaded = true;
    if (!serversView.hidden) {
      serversPollTimer = window.setTimeout(() => {
        serversLoaded = false;
        if (!serversView.hidden) void loadServers();
      }, 15000);
    }
  } catch (error) {
    serversLoading.hidden = true;
    if (!appShell.hidden) {
      serversError.hidden = false;
      serversErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshServersButton.disabled = false;
  }
}

const continuityLabels = {
  disabled: 'Não configurado', healthy: 'Saudável', warning: 'Atenção', critical: 'Crítico', unknown: 'Indeterminado'
};
const continuityPhaseLabels = {
  not_configured: 'Não implementado', preparing: 'Em preparação', protected: 'Protegido'
};
let latestRedundancyStatus = null;
const redundancyModeLabels = { standalone: 'Não configurado', primary: 'Principal', secondary: 'Secundário' };
const redundancyMigrationLabels = {
  not_started: 'Não iniciada', ready: 'Preparada', migrated: 'Migrada', validated: 'Validada'
};

function renderRedundancyStatus(payload) {
  latestRedundancyStatus = payload;
  const canManage = hasPlatformPermission('continuity', 'manage');
  redundancyRole.textContent = redundancyModeLabels[payload.mode] || payload.mode;
  redundancyLocalRole.textContent = redundancyModeLabels[payload.mode] || payload.mode;
  redundancyReadOnly.textContent = payload.administrationReadOnly
    ? 'administração somente leitura · ingestão ativa'
    : payload.mode === 'primary' ? 'autoridade de configuração · ingestão ativa' : 'ative antes de parear outra VM';
  redundancySiteCount.textContent = String((payload.sites?.length || 0) + (payload.mode === 'standalone' ? 0 : 1));
  redundancyMigration.textContent = redundancyMigrationLabels[payload.migrationStatus] || payload.migrationStatus;
  redundancyMigrationDetail.textContent = payload.legacy?.configured
    ? payload.legacy.message : 'nenhuma continuidade antiga ativa';

  redundancySites.replaceChildren();
  const local = document.createElement('article');
  local.className = 'redundancy-site';
  const localCopy = document.createElement('div');
  const localName = document.createElement('strong');
  const localUrl = document.createElement('small');
  const localState = document.createElement('em');
  localName.textContent = payload.siteName || 'Esta VM';
  localUrl.textContent = payload.publicUrl || window.location.origin;
  localState.textContent = payload.mode === 'standalone' ? 'local' : (redundancyModeLabels[payload.mode] || payload.mode);
  localCopy.append(localName, localUrl);
  local.append(localCopy, localState);
  redundancySites.append(local);
  for (const site of payload.sites || []) {
    const card = document.createElement('article');
    card.className = 'redundancy-site';
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    const detail = document.createElement('small');
    const stateBox = document.createElement('div');
    const state = document.createElement('em');
    name.textContent = site.name;
    detail.textContent = `${site.publicUrl} · ${site.lastSeenAt ? `visto ${formatDeviceMoment(site.lastSeenAt)}` : 'aguardando sincronização'}`;
    state.textContent = site.status;
    copy.append(name, detail);
    stateBox.append(state);
    if (canManage && payload.mode === 'primary') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary-button redundancy-remove-site';
      remove.dataset.siteId = site.id;
      remove.textContent = 'Desvincular';
      stateBox.append(remove);
    }
    card.append(copy, stateBox);
    redundancySites.append(card);
  }

  configureRedundancyPrimaryButton.hidden = !canManage || payload.mode !== 'standalone';
  createRedundancyEnrollmentButton.hidden = !canManage || payload.mode !== 'primary';
  advanceRedundancyMigrationButton.hidden = !canManage || payload.mode !== 'primary' || payload.migrationStatus === 'validated';
  promoteRedundancySecondaryButton.hidden = !canManage || payload.mode !== 'secondary';
}

redundancySites.addEventListener('click', async (event) => {
  const button = event.target.closest('.redundancy-remove-site');
  if (!button?.dataset.siteId || !window.confirm('Desvincular este servidor secundário? Ele deixará de receber configurações.')) return;
  button.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/redundancy/sites/${encodeURIComponent(button.dataset.siteId)}`, {
      method: 'DELETE', headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Não foi possível desvincular o servidor.');
    await loadRedundancyStatus();
  } catch (error) {
    setFormFeedback(redundancyFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
    button.disabled = false;
  }
});

async function loadRedundancyStatus() {
  const response = await authenticatedFetch(`${API_BASE}/v1/redundancy/status`, {
    headers: { Accept: 'application/json' }, cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Não foi possível consultar a nova redundância.');
  renderRedundancyStatus(payload);
}

configureRedundancyPrimaryButton.addEventListener('click', async () => {
  const siteName = window.prompt('Nome deste ambiente principal:', 'Servidor principal');
  if (!siteName) return;
  const publicUrl = window.prompt('URL pública deste ambiente:', window.location.origin);
  if (!publicUrl) return;
  configureRedundancyPrimaryButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/redundancy/primary`, {
      method: 'PUT', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteName, publicUrl })
    });
    if (!response.ok) throw new Error('Não foi possível ativar este ambiente como principal.');
    await loadRedundancyStatus();
    setFormFeedback(redundancyFeedback, 'Ambiente principal ativado. Agora gere o pareamento da segunda VM.');
  } catch (error) {
    setFormFeedback(redundancyFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  } finally { configureRedundancyPrimaryButton.disabled = false; }
});

createRedundancyEnrollmentButton.addEventListener('click', async () => {
  createRedundancyEnrollmentButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/redundancy/enrollments`, {
      method: 'POST', headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('Não foi possível gerar o código de pareamento.');
    redundancyToken.value = payload.token;
    redundancyEnrollmentCommand.hidden = false;
    setFormFeedback(redundancyFeedback, `Código válido até ${formatDeviceMoment(payload.expiresAt)}. Na VM secundária, cole somente este código quando o instalador solicitar o pareamento.`);
  } catch (error) {
    setFormFeedback(redundancyFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  } finally { createRedundancyEnrollmentButton.disabled = false; }
});

copyRedundancyTokenButton.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(redundancyToken.value); }
  catch { redundancyToken.select(); document.execCommand('copy'); }
  copyRedundancyTokenButton.textContent = 'Copiado';
  window.setTimeout(() => { copyRedundancyTokenButton.textContent = 'Copiar código'; }, 1800);
});

advanceRedundancyMigrationButton.addEventListener('click', async () => {
  const next = { not_started: 'ready', ready: 'migrated', migrated: 'validated' }[latestRedundancyStatus?.migrationStatus];
  if (!next || !window.confirm(`Avançar a migração para “${redundancyMigrationLabels[next]}”?`)) return;
  advanceRedundancyMigrationButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/redundancy/migration`, {
      method: 'PUT', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next })
    });
    if (!response.ok) throw new Error('A etapa não pode ser avançada antes da anterior.');
    await loadRedundancyStatus();
  } catch (error) {
    setFormFeedback(redundancyFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  } finally { advanceRedundancyMigrationButton.disabled = false; }
});

promoteRedundancySecondaryButton.addEventListener('click', async () => {
  const confirmation = window.prompt('Isole o servidor principal antigo e digite PROMOVER SECUNDARIO:');
  if (confirmation !== 'PROMOVER SECUNDARIO') return;
  promoteRedundancySecondaryButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/redundancy/promote`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation, primaryIsolated: true })
    });
    if (!response.ok) throw new Error('Não foi possível promover esta VM.');
    await loadRedundancyStatus();
    setFormFeedback(redundancyFeedback, 'VM promovida. Mantenha o servidor antigo isolado até a reintegração.');
  } catch (error) {
    setFormFeedback(redundancyFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  } finally { promoteRedundancySecondaryButton.disabled = false; }
});

function continuityMetric(component) {
  if (!component?.data) return 'Sem telemetria';
  const data = component.data;
  if ('role' in data) {
    const lag = data.replayLagSeconds === null ? 'atraso indisponível' : `${formatRate(data.replayLagSeconds)} s de atraso`;
    return `${data.role === 'primary' ? 'primário' : 'standby'} · ${lag}`;
  }
  if ('replicatedTables' in data) {
    if (component.status === 'healthy' && data.replicatedTables === 0) return 'Operacional · réplica ainda não iniciada';
    return `${formatNumber(data.replicatedTables)} tabela(s) · fila ${formatNumber(data.queueSize)} · ${formatRate(data.absoluteDelaySeconds)} s`;
  }
  return data.ready ? 'Readiness confirmado' : 'Readiness recusado';
}

function continuityWorstStatus(statuses) {
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('warning')) return 'warning';
  if (statuses.includes('unknown')) return 'unknown';
  if (statuses.length && statuses.every((status) => status === 'healthy')) return 'healthy';
  return 'disabled';
}

function setContinuityService(copy, indicator, component, fallback = 'Sem telemetria') {
  const status = component?.status || 'unknown';
  copy.textContent = component ? continuityMetric(component) : fallback;
  copy.title = component?.detail || fallback;
  indicator.className = status;
  indicator.title = continuityLabels[status] || status;
}

function continuityLocalAvailability(component) {
  if (!component?.data) return component;
  const data = component.data;
  if ('ready' in data) return component;
  if ('readonlyTables' in data && data.readonlyTables > 0) return { ...component, status: 'critical' };
  return { ...component, status: 'healthy' };
}

function renderContinuityTopology(payload) {
  const observerSite = payload.observer?.site === 'b' ? 'b' : 'a';
  const observerHostname = payload.observer?.hostname || 'VM não identificada';
  const localRole = payload.components.postgresPrimary?.data?.role;
  const activeSite = localRole === 'primary' ? observerSite : localRole === 'standby' ? (observerSite === 'a' ? 'b' : 'a') : 'a';
  const localPg = payload.components.postgresPrimary;
  const remotePg = payload.components.postgresStandby;
  const localCh = payload.components.clickhousePrimary;
  const remoteCh = payload.components.clickhouseStandby;
  const siteAPg = observerSite === 'a' ? localPg : remotePg;
  const siteBPg = observerSite === 'b' ? localPg : remotePg;
  const siteACh = observerSite === 'a' ? localCh : remoteCh;
  const siteBCh = observerSite === 'b' ? localCh : remoteCh;
  const localApp = { status: 'healthy', detail: 'API que respondeu a esta tela', data: { ready: true } };
  const unavailableApp = { status: 'unknown', detail: 'O observador atual não consulta a API deste site', data: null };
  const siteAApp = observerSite === 'a' ? localApp : unavailableApp;
  const siteBApp = observerSite === 'b' ? localApp : payload.components.standbyApi;
  const siteAPgAvailability = continuityLocalAvailability(siteAPg);
  const siteBPgAvailability = continuityLocalAvailability(siteBPg);
  const siteAChAvailability = continuityLocalAvailability(siteACh);
  const siteBChAvailability = continuityLocalAvailability(siteBCh);
  const routing = currentContinuityRouting;
  const inventory = currentContinuityEnrollment?.inventory;

  continuityObserver.textContent = `Leitura por ${observerHostname} · DC-${observerSite.toUpperCase()}`;
  continuitySiteAName.textContent = payload.sites.active;
  continuitySiteBName.textContent = payload.sites.standby;
  continuitySiteAVm.textContent = observerSite === 'a' ? observerHostname : routing?.siteAHost || routing?.siteAPrivateHost || 'VM primária';
  continuitySiteBVm.textContent = observerSite === 'b' ? observerHostname : inventory?.hostname || routing?.siteBHost || routing?.siteBPrivateHost || 'VM standby';
  continuitySiteAAddress.textContent = routing?.siteAHost || routing?.siteAPrivateHost || 'Não informado';
  continuitySiteBAddress.textContent = routing?.siteBHost || routing?.siteBPrivateHost || 'Não informado';

  setContinuityService(continuitySiteAPostgres, continuitySiteAPostgresStatus, siteAPgAvailability);
  setContinuityService(continuitySiteAClickhouse, continuitySiteAClickhouseStatus, siteAChAvailability);
  setContinuityService(continuitySiteAApp, continuitySiteAAppStatus, siteAApp);
  setContinuityService(continuitySiteBPostgres, continuitySiteBPostgresStatus, siteBPgAvailability);
  setContinuityService(continuitySiteBClickhouse, continuitySiteBClickhouseStatus, siteBChAvailability);
  setContinuityService(continuitySiteBApp, continuitySiteBAppStatus, siteBApp);

  const setSiteState = (element, role, site, statuses) => {
    const siteStatus = continuityWorstStatus(statuses);
    const isActive = activeSite === site;
    element.className = `continuity-site-card ${isActive ? 'active' : siteStatus === 'critical' ? 'critical' : 'standby'}`;
    role.textContent = isActive ? 'Em operação' : payload.phase === 'preparing' ? 'Em preparação' : siteStatus === 'critical' ? 'Atenção' : 'Standby';
  };
  setSiteState(continuitySiteA, continuitySiteARole, 'a', [siteAPgAvailability.status, siteAChAvailability.status, siteAApp.status]);
  setSiteState(continuitySiteB, continuitySiteBRole, 'b', [siteBPgAvailability.status, siteBChAvailability.status, siteBApp.status]);

  const copyLevel = payload.phase === 'not_configured' ? 'disabled' : continuityWorstStatus([
    payload.components.postgresStandby.status,
    payload.components.clickhousePrimary.status,
    payload.components.clickhouseStandby.status
  ]);
  continuityReplicationLane.className = `continuity-replication-lane ${copyLevel}`;
  if (copyLevel === 'healthy') {
    continuityCopyStatus.textContent = 'Cópia sincronizada';
    continuityCopyDetail.textContent = `PostgreSQL e ClickHouse operacionais · RPO ${payload.estimatedRpoSeconds === null ? 'indisponível' : `${formatRate(payload.estimatedRpoSeconds)} s`}`;
  } else if (copyLevel === 'warning') {
    continuityCopyStatus.textContent = 'Cópia parcial';
    continuityCopyDetail.textContent = 'Há uma etapa de migração ou fila que ainda requer atenção.';
  } else if (copyLevel === 'critical') {
    continuityCopyStatus.textContent = 'Cópia interrompida';
    continuityCopyDetail.textContent = 'Um ou mais vínculos de replicação não responderam corretamente.';
  } else {
    continuityCopyStatus.textContent = 'Aguardando configuração';
    continuityCopyDetail.textContent = 'A replicação será exibida assim que o DC-B estiver preparado.';
  }

  continuityTopology.hidden = false;
  continuityTechnical.hidden = false;
}

function renderContinuityComponents(components) {
  const labels = {
    postgresPrimary: 'PostgreSQL · site ativo', postgresStandby: 'PostgreSQL · site standby',
    clickhousePrimary: 'ClickHouse · site ativo', clickhouseStandby: 'ClickHouse · site standby', standbyApi: 'API · site standby'
  };
  continuityComponents.replaceChildren(...Object.entries(labels).map(([key, label]) => {
    const component = components[key];
    const article = document.createElement('article');
    article.className = `continuity-component ${component.status}`;
    const heading = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = label;
    const badge = document.createElement('span');
    badge.textContent = continuityLabels[component.status] || component.status;
    heading.append(title, badge);
    const metric = document.createElement('b');
    metric.textContent = continuityMetric(component);
    const detail = document.createElement('p');
    detail.textContent = component.detail;
    article.append(heading, metric, detail);
    return article;
  }));
}

async function loadContinuity() {
  if (continuityPollTimer) window.clearTimeout(continuityPollTimer);
  continuityPollTimer = null;
  continuityLoading.hidden = false;
  continuityError.hidden = true;
  refreshContinuityButton.disabled = true;
  try {
    try {
      await loadRedundancyStatus();
    } catch (error) {
      setFormFeedback(redundancyFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
    }
    const response = await authenticatedFetch(`${API_BASE}/v1/continuity/status`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 403 ? 'Seu perfil não possui acesso à continuidade.' : 'O monitor de continuidade não respondeu corretamente.');
    continuityStatus.textContent = continuityPhaseLabels[payload.phase] || continuityLabels[payload.status] || payload.status;
    continuityStatus.className = `continuity-value ${payload.phase === 'protected' ? payload.status : 'disabled'}`;
    continuityStatusDetail.textContent = payload.phase === 'protected'
      ? `limites: ${payload.thresholds.warningSeconds}/${payload.thresholds.criticalSeconds} s`
      : payload.phase === 'preparing' ? 'DC-B cadastrado; validação e ativação automáticas em andamento' : 'aguardando instalação e validação do DC-B';
    continuityRpo.textContent = payload.estimatedRpoSeconds === null ? '—' : `${formatRate(payload.estimatedRpoSeconds)} s`;
    continuityReady.textContent = payload.failoverReady ? 'Pronto' : payload.configured ? 'Não pronto' : 'Pendente';
    continuityReady.className = `continuity-value ${payload.failoverReady ? 'healthy' : payload.configured ? 'critical' : 'disabled'}`;
    continuitySites.textContent = `${payload.sites.active} → ${payload.sites.standby}`;
    continuityGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    latestContinuitySnapshot = payload;
    renderContinuityTopology(payload);
    renderContinuityComponents(payload.components);
    continuityLoading.hidden = true;
    continuityLoaded = true;
    if (!continuityView.hidden) continuityPollTimer = window.setTimeout(() => { continuityLoaded = false; void loadContinuity(); }, 15000);
  } catch (error) {
    continuityLoading.hidden = true;
    continuityError.hidden = false;
    continuityErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
  } finally {
    refreshContinuityButton.disabled = false;
  }
}

const continuityEnrollmentLabels = {
  pending: 'Aguardando VM', enrolled: 'Cadastrado', expired: 'Token expirado', revoked: 'Token revogado'
};

function renderContinuityEnrollment(enrollment, routing = null) {
  currentContinuityEnrollment = enrollment;
  currentContinuityRouting = routing;
  const inventory = enrollment?.inventory;
  continuitySettingsOrigin.textContent = enrollment ? continuityEnrollmentLabels[enrollment.status] || enrollment.status : 'Não cadastrado';
  continuitySettingsSource.textContent = enrollment?.status === 'pending'
    ? `token expira em ${formatDeviceMoment(enrollment.expiresAt)}`
    : enrollment?.status === 'enrolled' ? `registrado em ${formatDeviceMoment(enrollment.enrolledAt)}` : 'use o instalador automático';
  continuitySettingsConnections.textContent = inventory?.hostname || '—';
  continuitySettingsTest.textContent = inventory ? `${inventory.vcpu} vCPU · ${inventory.memoryGiB} GiB` : '—';
  continuitySettingsTest.className = enrollment?.status === 'enrolled' ? 'summary-good' : '';
  continuitySettingsTestDetail.textContent = inventory
    ? `${inventory.operatingSystem} · ${inventory.architecture}` : 'aguardando inventário da VM';
  continuityRoutingOverview.hidden = !routing;
  if (routing) {
    continuityRoutingPanel.textContent = routing.panelHost;
    continuityRoutingIngest.textContent = routing.ingestHost;
    continuityRoutingControl.textContent = routing.drControlHost;
    continuityRoutingDetail.textContent = `${routing.siteAHost || routing.siteAPrivateHost} → ${routing.siteBHost || routing.siteBPrivateHost} · ${routing.dnsProvider} · TTL ${routing.dnsTtlSeconds}s`;
  }
  if (latestContinuitySnapshot) renderContinuityTopology(latestContinuitySnapshot);
  const canManage = hasPlatformPermission('continuity', 'manage');
  continuitySettingsPanel.classList.toggle('read-only', !canManage);
  configureContinuityButton.hidden = !canManage || enrollment?.status === 'enrolled';
  configureContinuityButton.textContent = enrollment?.status === 'pending' ? 'Gerar novo token' : 'Adicionar DC-B';
}

async function loadContinuityEnrollment({ poll = true } = {}) {
  if (continuityEnrollmentPollTimer) window.clearTimeout(continuityEnrollmentPollTimer);
  continuityEnrollmentPollTimer = null;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/continuity/enrollments/current`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('Não foi possível consultar o cadastro do DC-B.');
    currentContinuityDefaults = payload.defaults ?? null;
    renderContinuityEnrollment(payload.enrollment ?? null, payload.routing ?? null);
    continuityEnrollmentLoaded = true;
    if (payload.enrollment?.status === 'enrolled' && continuitySettingsDialog.open) continuitySettingsDialog.close();
    if (poll && !continuityView.hidden && payload.enrollment?.status === 'pending') {
      continuityEnrollmentPollTimer = window.setTimeout(() => void loadContinuityEnrollment(), 5000);
    }
  } catch (error) {
    continuitySettingsSource.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
  }
}

configureContinuityButton.addEventListener('click', async () => {
  if (!continuityEnrollmentLoaded) await loadContinuityEnrollment({ poll: false });
  continuitySiteAInput.value = latestContinuitySnapshot?.sites?.active || 'Data Center A';
  continuitySiteBInput.value = latestContinuitySnapshot?.sites?.standby || 'Data Center B';
  continuitySiteAHostInput.value = currentContinuityRouting?.siteAHost || currentContinuityRouting?.siteAPrivateHost || currentContinuityDefaults?.siteAHost || '';
  continuitySiteBHostInput.value = currentContinuityRouting?.siteBHost || currentContinuityRouting?.siteBPrivateHost || '';
  saveContinuitySettingsButton.querySelector('.button-label').textContent = currentContinuityEnrollment?.status === 'pending'
    ? 'Gerar novo comando' : 'Gerar comando de cadastro';
  continuityEnrollmentCommand.hidden = true;
  continuityCommand.value = '';
  continuityWizardTestState.className = 'continuity-test-state';
  continuityWizardTestCopy.textContent = currentContinuityEnrollment?.status === 'pending'
    ? 'Ao gerar um novo token, o anterior será revogado.' : 'Gere um token e execute o comando como administrador na VM do DC-B.';
  revokeContinuityEnrollmentButton.hidden = currentContinuityEnrollment?.status !== 'pending';
  setFormFeedback(continuitySettingsFeedback, '');
  continuitySettingsDialog.showModal();
});

closeContinuitySettingsButton.addEventListener('click', () => continuitySettingsDialog.close());

continuitySettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setFormFeedback(continuitySettingsFeedback, '');
  setButtonLoading(saveContinuitySettingsButton, true);
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/continuity/enrollments`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteAName: continuitySiteAInput.value.trim(), siteBName: continuitySiteBInput.value.trim(),
        siteAHost: continuitySiteAHostInput.value.trim(), siteBHost: continuitySiteBHostInput.value.trim()
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error === 'public_url_not_configured'
      ? 'A URL pública do LogVault precisa estar definida pelo administrador da instalação.'
      : payload.error === 'dc_a_preparation_failed'
        ? `Não foi possível preparar o DC-A: ${payload.message || 'verifique os DNS e o agente local.'}`
        : 'Não foi possível gerar o comando de instalação.');
    currentContinuityEnrollment = payload.enrollment;
    continuityCommand.value = payload.command;
    continuityEnrollmentCommand.hidden = false;
    revokeContinuityEnrollmentButton.hidden = false;
    continuityWizardTestState.className = 'continuity-test-state healthy';
    continuityWizardTestCopy.textContent = `DC-A preparado (${payload.preparation?.bind || 'interface validada'}; acesso do DC-B ${payload.preparation?.cidr || 'restrito'}). Execute o comando até ${formatDeviceMoment(payload.enrollment.expiresAt)}.`;
    saveContinuitySettingsButton.querySelector('.button-label').textContent = 'Gerar novo comando';
    renderContinuityEnrollment(payload.enrollment);
    continuityEnrollmentLoaded = true;
    if (!continuityView.hidden) continuityEnrollmentPollTimer = window.setTimeout(() => void loadContinuityEnrollment(), 5000);
  } catch (error) {
    setFormFeedback(continuitySettingsFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  } finally { setButtonLoading(saveContinuitySettingsButton, false); }
});

copyContinuityCommandButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(continuityCommand.value);
    copyContinuityCommandButton.textContent = 'Copiado';
    window.setTimeout(() => { copyContinuityCommandButton.textContent = 'Copiar comando'; }, 1800);
  } catch {
    continuityCommand.select();
    document.execCommand('copy');
  }
});

revokeContinuityEnrollmentButton.addEventListener('click', async () => {
  if (!currentContinuityEnrollment?.id) return;
  revokeContinuityEnrollmentButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/continuity/enrollments/${currentContinuityEnrollment.id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('O token já foi utilizado, expirou ou foi revogado.');
    continuityEnrollmentCommand.hidden = true;
    continuityCommand.value = '';
    continuityEnrollmentLoaded = false;
    await loadContinuityEnrollment({ poll: false });
    continuitySettingsDialog.close();
  } catch (error) {
    setFormFeedback(continuitySettingsFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  } finally { revokeContinuityEnrollmentButton.disabled = false; }
});

function formatRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(numeric);
}

function renderCapacityDevices(devices) {
  capacityBody.replaceChildren();
  for (const device of devices) {
    const identity = document.createElement('td');
    identity.dataset.label = 'Equipamento';
    const wrapper = document.createElement('span');
    wrapper.className = 'capacity-device';
    const name = document.createElement('strong');
    name.textContent = device.name;
    const detail = document.createElement('small');
    detail.textContent = `${String(device.vendor).toUpperCase()} · ${device.exporterIp}`;
    wrapper.append(name, detail);
    identity.append(wrapper);
    const row = document.createElement('tr');
    row.append(
      identity,
      td(formatNumber(device.rawRecords24h), 'Registros brutos 24 h'),
      td(formatNumber(device.events24h), 'Eventos 24 h'),
      td(formatRate(device.eventsPerSecond5m), 'Eventos/s'),
      td(formatBytes(device.projectedDailyBytes), 'Projeção diária'),
      td(formatBytes(device.projectedRetentionBytes), 'Projeção 13 meses'),
      td(formatDeviceMoment(device.lastReceivedAt), 'Último recebimento')
    );
    capacityBody.append(row);
  }
}

function renderCapacityTenants(tenants) {
  capacityBody.replaceChildren();
  for (const tenant of tenants) {
    const identity = document.createElement('td');
    identity.dataset.label = 'Cliente';
    const wrapper = document.createElement('span');
    wrapper.className = 'capacity-device';
    const name = document.createElement('strong');
    name.textContent = tenant.name;
    const detail = document.createElement('small');
    detail.textContent = tenant.active ? 'Cliente ativo' : 'Cliente desativado · dados ainda armazenados';
    wrapper.append(name, detail);
    identity.append(wrapper);
    const row = document.createElement('tr');
    row.append(
      identity,
      td(`${formatNumber(tenant.enabledDevices)} / ${formatNumber(tenant.configuredDevices)}`, 'Equipamentos'),
      td(formatNumber(tenant.events24h), 'Eventos 24 h'),
      td(formatRate(tenant.eventsPerSecond5m), 'Eventos/s'),
      td(formatBytes(tenant.estimatedCurrentBytes), 'Armazenamento atual'),
      td(formatBytes(tenant.projectedDailyBytes), 'Projeção diária'),
      td(formatBytes(tenant.recommendedRetentionBytes), 'Retenção recomendada'),
      td(formatDeviceMoment(tenant.lastReceivedAt), 'Último recebimento')
    );
    capacityBody.append(row);
  }
}

function configureCapacityScope(platformScope) {
  capacityIntroCopy.textContent = platformScope
    ? 'Acompanhe o consumo real da VM principal, compare os clientes e simule novos cenários de crescimento.'
    : 'Meça a carga real do ambiente e projete armazenamento, spool e desempenho antes de definir os planos.';
  capacityCurrentStorageLabel.textContent = platformScope ? 'ARMAZENAMENTO DOS LOGS NA VM' : 'ARMAZENAMENTO ATUAL';
  capacityEntitiesLabel.textContent = platformScope ? 'CLIENTES' : 'EQUIPAMENTOS';
  capacityTableTitle.textContent = platformScope ? 'Consumo por cliente' : 'Consumo por equipamento';
  capacityOriginHeading.textContent = platformScope ? 'Cliente' : 'Equipamento';
  capacityRawHeading.textContent = platformScope ? 'Equipamentos' : 'Registros brutos 24 h';
  capacityCurrentHeading.hidden = !platformScope;
  capacityRetentionHeading.textContent = platformScope ? 'Retenção recomendada' : 'Projeção 13 meses';
}

async function loadCapacity() {
  capacityLoading.hidden = false;
  capacityError.hidden = true;
  capacityTableWrap.hidden = true;
  refreshCapacityButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/capacity`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 403 ? 'Seu perfil não possui acesso ao dimensionamento.' : 'O cálculo de capacidade não respondeu corretamente.');
    const platformScope = payload.scope === 'platform';
    configureCapacityScope(platformScope);
    capacityEventsRate.textContent = formatRate(payload.overview.eventsPerSecond5m);
    capacityEventsPeak.textContent = formatRate(payload.overview.peakEventsPerSecond24h);
    capacityDailyStorage.textContent = formatBytes(payload.storage.projectedDailyBytes);
    capacityRetentionStorage.textContent = formatBytes(payload.storage.recommendedRetentionBytes);
    capacityCurrentStorage.textContent = formatBytes(payload.storage.tenantEstimatedCurrentBytes);
    const coverageDays = payload.storage.coverageDays;
    capacityCoverage.textContent = coverageDays === null
      ? 'nenhum histórico armazenado'
      : coverageDays < 1
        ? `${formatRate(coverageDays * 24)} hora(s) de histórico observado`
        : `${formatRate(coverageDays)} dia(s) de histórico observado`;
    capacitySpool.textContent = payload.spool.recommendedOfflineBytes === null
      ? 'Aguardando dados'
      : formatBytes(payload.spool.recommendedOfflineBytes);
    capacityQueryP95.textContent = payload.queryPerformance.p95Ms === null
      ? 'Sem amostras'
      : `${formatNumber(payload.queryPerformance.p95Ms)} ms`;
    capacityQuerySamples.textContent = `${formatNumber(payload.queryPerformance.samples24h)} consulta(s) medida(s) nas últimas 24 h`;
    if (platformScope) {
      capacityDevices.textContent = `${formatNumber(payload.overview.activeTenants)} / ${formatNumber(payload.overview.customerTenants)}`;
      capacityEntitiesDetail.textContent = `${formatNumber(payload.overview.enabledDevices)} de ${formatNumber(payload.overview.configuredDevices)} equipamento(s) ativo(s)`;
    } else {
      capacityDevices.textContent = `${formatNumber(payload.overview.enabledDevices)} / ${formatNumber(payload.overview.configuredDevices)}`;
      capacityEntitiesDetail.textContent = 'ativos e cadastrados';
    }
    capacityGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    if (platformScope) renderCapacityTenants(payload.tenants);
    else renderCapacityDevices(payload.devices);
    capacityLoading.hidden = true;
    capacityTableWrap.hidden = platformScope ? payload.tenants.length === 0 : payload.devices.length === 0;
    capacityLoaded = true;
  } catch (error) {
    capacityLoading.hidden = true;
    if (!appShell.hidden) {
      capacityError.hidden = false;
      capacityErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshCapacityButton.disabled = false;
  }
}

function selectCapacityTab(tab) {
  const calculatorSelected = tab === 'calculator';
  capacityLiveTab.classList.toggle('active', !calculatorSelected);
  capacityCalculatorTab.classList.toggle('active', calculatorSelected);
  capacityLiveTab.setAttribute('aria-selected', String(!calculatorSelected));
  capacityCalculatorTab.setAttribute('aria-selected', String(calculatorSelected));
  capacityLivePanel.hidden = calculatorSelected;
  capacityCalculatorPanel.hidden = !calculatorSelected;
  refreshCapacityButton.hidden = calculatorSelected;
}

function syncCapacityVendorScenario() {
  const mixed = capacityVendorScenario.value === 'mixed';
  capacityCiscoMixField.hidden = !mixed;
  capacityCiscoPercent.required = mixed;
}

async function calculateStorageEstimate(event) {
  event?.preventDefault();
  const scenario = capacityVendorScenario.value;
  const ciscoPercent = scenario === 'cisco' ? 100 : scenario === 'a10' ? 0 : Number(capacityCiscoPercent.value);
  capacityCalculateButton.disabled = true;
  capacityCalculateButton.textContent = 'Calculando…';
  setFormFeedback(capacityCalculatorFeedback, '');
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/capacity/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        subscribers: Number(capacitySubscribers.value),
        ciscoPercent,
        growthPercent: Number(capacityGrowthPercent.value),
        headroomPercent: Number(capacityHeadroomPercent.value),
        offlineHours: Number(capacityOfflineHours.value)
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(response.status === 400
        ? 'Revise a quantidade de assinantes e os percentuais informados.'
        : response.status === 403 ? 'Seu perfil não possui acesso à calculadora.' : 'Não foi possível calcular a estimativa.');
    }
    capacityEstimateMonthly.textContent = formatBytes(payload.estimate.recommendedMonthlyBytes);
    capacityEstimateRetention.textContent = formatBytes(payload.estimate.retentionBytes);
    capacityEstimateBackups.textContent = formatBytes(payload.estimate.backupBytes);
    capacityEstimateDisk.textContent = formatBytes(payload.estimate.recommendedDiskBytes);
    capacityEstimateSubscribers.textContent = formatNumber(payload.input.projectedSubscribers);
    capacityEstimateMix.textContent = `${formatRate(payload.input.ciscoPercent)}% Cisco · ${formatRate(payload.input.a10Percent)}% A10`;
    capacityEstimateBaseline.textContent = `${formatRate(payload.assumptions.weightedMonthlyGbPerThousand)} GB`;
    capacityEstimateFree.textContent = formatBytes(payload.estimate.operationalFreeBytes);
    capacityEdgeWindow.textContent = `Janela local: ${formatNumber(payload.edge.windowHours)} h`;
    capacityEdgeSpool.textContent = formatBytes(payload.edge.recommendedSpoolBytes);
    capacityEdgeSystem.textContent = formatBytes(payload.edge.systemReserveBytes);
    capacityEdgeFree.textContent = formatBytes(payload.edge.operationalFreeBytes);
    capacityEdgeDisk.textContent = formatBytes(payload.edge.recommendedDiskBytes);
    capacityEdgeExplanation.textContent = `A janela soma 24 horas de registros confirmados e ${formatNumber(payload.input.offlineHours)} hora(s) sem internet. A VM mantém 20% do disco livre e nunca recomenda menos de 30 GB.`;
    capacityCalculatorResults.hidden = false;
    capacityEstimateDetail.hidden = false;
    capacityEdgeEstimate.hidden = false;
    setFormFeedback(capacityCalculatorFeedback, `Estimativa para ${formatNumber(payload.input.projectedSubscribers)} assinante(s), já considerando o crescimento informado.`);
  } catch (error) {
    setFormFeedback(capacityCalculatorFeedback, error instanceof Error ? error.message : 'Falha inesperada.', true);
  } finally {
    capacityCalculateButton.disabled = false;
    capacityCalculateButton.textContent = 'Calcular estimativa';
  }
}

function populatePlanSelect(select, selectedCode = '') {
  select.replaceChildren();
  for (const plan of availablePlans) {
    const option = document.createElement('option');
    option.value = plan.code;
    option.textContent = plan.deviceLimit === null ? `${plan.name} · sem limite` : `${plan.name} · ${formatNumber(plan.deviceLimit)} equipamento(s)`;
    option.selected = plan.code === selectedCode;
    select.append(option);
  }
}

function syncCustomLimit(planSelect, limitInput) {
  const plan = availablePlans.find((candidate) => candidate.code === planSelect.value);
  limitInput.disabled = false;
  limitInput.required = false;
  limitInput.placeholder = plan?.deviceLimit === null
    ? 'Plano sem limite'
    : plan ? `Usar ${formatNumber(plan.deviceLimit)} do plano` : 'Usar plano';
}

async function saveServicePlan(plan, row) {
  const buttons = [...row.querySelectorAll('button')];
  buttons.forEach((button) => { button.disabled = true; });
  const name = row.querySelector('[data-plan-name]').value.trim();
  const limitValue = row.querySelector('[data-plan-limit]').value;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/plans/${encodeURIComponent(plan.code)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, deviceLimit: limitValue === '' ? null : Number(limitValue) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        plan_name_already_exists: 'Já existe um plano ativo com este nome.',
        plan_limit_below_usage: `Há cliente usando ${formatNumber(payload.devicesUsed)} equipamento(s) sem limite específico.`,
        invalid_plan_update: 'Revise o nome e o limite do plano.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível atualizar o plano.');
    }
    clientsLoaded = false;
    plansLoaded = false;
    await loadPlans();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao atualizar plano.');
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function deleteServicePlan(plan, row) {
  if (!window.confirm(`Excluir o plano “${plan.name}” do catálogo?`)) return;
  const buttons = [...row.querySelectorAll('button')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/plans/${encodeURIComponent(plan.code)}`, {
      method: 'DELETE', headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        plan_in_use: 'Mova os clientes para outro plano antes de excluí-lo.',
        last_active_plan: 'É necessário manter pelo menos um plano ativo.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível excluir o plano.');
    }
    clientsLoaded = false;
    plansLoaded = false;
    await loadPlans();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao excluir plano.');
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function renderPlans(plans) {
  plansBody.replaceChildren();
  const canManage = hasPlatformPermission('plans', 'manage');
  for (const plan of plans) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.dataset.label = 'Plano';
    const name = document.createElement('input');
    name.value = plan.name;
    name.maxLength = 200;
    name.dataset.planName = '';
    name.disabled = !canManage;
    nameCell.append(name);
    const limitCell = document.createElement('td');
    limitCell.dataset.label = 'Limite de equipamentos';
    const limit = document.createElement('input');
    limit.type = 'number';
    limit.min = '1';
    limit.max = '10000';
    limit.placeholder = 'Sem limite';
    limit.dataset.planLimit = '';
    if (plan.deviceLimit !== null) limit.value = String(plan.deviceLimit);
    limit.disabled = !canManage;
    limitCell.append(limit);
    const actionsCell = document.createElement('td');
    actionsCell.dataset.label = 'Ações';
    const actions = document.createElement('div');
    actions.className = 'user-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'table-action';
    save.textContent = 'Salvar alterações';
    save.addEventListener('click', () => void saveServicePlan(plan, row));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'table-action danger';
    remove.textContent = 'Excluir';
    remove.addEventListener('click', () => void deleteServicePlan(plan, row));
    if (canManage) actions.append(save, remove);
    else {
      const readOnly = document.createElement('span');
      readOnly.className = 'access-profile-read-only';
      readOnly.textContent = 'Somente visualização';
      actions.append(readOnly);
    }
    actionsCell.append(actions);
    row.append(nameCell, limitCell, td(formatNumber(plan.assignedTenants), 'Clientes usando'), actionsCell);
    plansBody.append(row);
  }
}

const companyFieldNames = [
  'legalName', 'tradeName', 'cnpj', 'phone', 'email', 'postalCode', 'street',
  'addressNumber', 'complement', 'district', 'city', 'state'
];
const postalCodeCache = new Map();

function postalCodeDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

function formatPostalCode(value) {
  const digits = postalCodeDigits(value);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function setPostalCodeFeedback(feedback, message, state = '') {
  feedback.textContent = message;
  feedback.classList.toggle('loading', state === 'loading');
  feedback.classList.toggle('success', state === 'success');
  feedback.classList.toggle('error', state === 'error');
}

function attachPostalCodeLookup({ form: profileForm, feedback, fields }) {
  const postalCodeInput = profileForm.elements[fields.postalCode];
  let timer = null;
  let requestSequence = 0;

  const lookup = async () => {
    const postalCode = postalCodeDigits(postalCodeInput.value);
    if (postalCode.length !== 8 || postalCodeInput.dataset.cepResolved === postalCode) return;
    const sequence = ++requestSequence;
    postalCodeInput.classList.add('cep-loading');
    setPostalCodeFeedback(feedback, 'Buscando endereço…', 'loading');
    try {
      let address = postalCodeCache.get(postalCode);
      if (!address) {
        const response = await authenticatedFetch(`${API_BASE}/v1/address/postal-code/${postalCode}`, {
          headers: { Accept: 'application/json' }, cache: 'no-store'
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const messages = {
            postal_code_not_found: 'CEP não encontrado. Preencha o endereço manualmente.',
            postal_code_service_unavailable: 'Consulta de CEP indisponível. Você pode preencher manualmente.',
            invalid_postal_code: 'Informe um CEP válido com 8 dígitos.'
          };
          throw new Error(messages[payload.error] || 'Não foi possível consultar o CEP.');
        }
        address = payload.address;
        postalCodeCache.set(postalCode, address);
      }
      if (sequence !== requestSequence || postalCodeDigits(postalCodeInput.value) !== postalCode) return;
      postalCodeInput.value = formatPostalCode(address.postalCode || postalCode);
      profileForm.elements[fields.street].value = address.street || '';
      profileForm.elements[fields.district].value = address.district || '';
      profileForm.elements[fields.city].value = address.city || '';
      profileForm.elements[fields.state].value = address.state || '';
      postalCodeInput.dataset.cepResolved = postalCode;
      setPostalCodeFeedback(feedback, 'Endereço preenchido. Revise e informe o número.', 'success');
    } catch (error) {
      if (sequence !== requestSequence) return;
      delete postalCodeInput.dataset.cepResolved;
      setPostalCodeFeedback(feedback, error instanceof Error ? error.message : 'Falha ao consultar CEP.', 'error');
    } finally {
      if (sequence === requestSequence) postalCodeInput.classList.remove('cep-loading');
    }
  };

  postalCodeInput.addEventListener('input', () => {
    const digits = postalCodeDigits(postalCodeInput.value);
    postalCodeInput.value = formatPostalCode(digits);
    if (postalCodeInput.dataset.cepResolved !== digits) delete postalCodeInput.dataset.cepResolved;
    requestSequence += 1;
    postalCodeInput.classList.remove('cep-loading');
    if (timer) window.clearTimeout(timer);
    if (digits.length === 8) {
      setPostalCodeFeedback(feedback, 'CEP completo. Buscando endereço…', 'loading');
      timer = window.setTimeout(() => void lookup(), 350);
    } else {
      setPostalCodeFeedback(feedback, digits.length ? 'Digite os 8 dígitos do CEP.' : 'Digite o CEP para preencher o endereço.');
    }
  });
  postalCodeInput.addEventListener('blur', () => {
    if (timer) window.clearTimeout(timer);
    if (postalCodeDigits(postalCodeInput.value).length === 8) void lookup();
  });
}

function companyPayloadFromForm(profileForm) {
  const data = new FormData(profileForm);
  return Object.fromEntries(companyFieldNames.map((name) => [name, String(data.get(name) || '').trim()]));
}

function fillCompanyForm(profileForm, profile) {
  companyFieldNames.forEach((name) => {
    if (!profileForm.elements[name]) return;
    profileForm.elements[name].value = name === 'postalCode'
      ? formatPostalCode(profile?.[name] || '')
      : profile?.[name] || '';
  });
  const postalCode = postalCodeDigits(profile?.postalCode || '');
  if (postalCode) profileForm.elements.postalCode.dataset.cepResolved = postalCode;
  else delete profileForm.elements.postalCode.dataset.cepResolved;
}

attachPostalCodeLookup({
  form: companyProfileForm,
  feedback: document.querySelector('[data-cep-feedback="company"]'),
  fields: { postalCode: 'postalCode', street: 'street', district: 'district', city: 'city', state: 'state' }
});
attachPostalCodeLookup({
  form: createClientForm,
  feedback: document.querySelector('[data-cep-feedback="new-company"]'),
  fields: {
    postalCode: 'companyPostalCode', street: 'companyStreet', district: 'companyDistrict',
    city: 'companyCity', state: 'companyState'
  }
});
attachPostalCodeLookup({
  form: platformCompanyForm,
  feedback: document.querySelector('[data-cep-feedback="platform-company"]'),
  fields: { postalCode: 'postalCode', street: 'street', district: 'district', city: 'city', state: 'state' }
});

function renderCompanyLogo(preview, source = '') {
  preview.replaceChildren();
  if (!source) {
    const empty = document.createElement('span');
    empty.textContent = 'Sem logotipo';
    preview.append(empty);
    return;
  }
  const image = document.createElement('img');
  image.alt = 'Logotipo da empresa';
  image.src = source;
  image.addEventListener('error', () => renderCompanyLogo(preview));
  preview.append(image);
}

function readCompanyLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!['image/png', 'image/jpeg'].includes(file.type)) return reject(new Error('Use um logotipo PNG ou JPEG.'));
    if (file.size > 512 * 1024) return reject(new Error('O logotipo deve ter no máximo 512 KB.'));
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(new Error('Não foi possível ler o logotipo.')));
    reader.readAsDataURL(file);
  });
}

async function loadCompanyProfile() {
  companyProfileFeedback.hidden = true;
  setPostalCodeFeedback(document.querySelector('[data-cep-feedback="company"]'), 'Digite o CEP para preencher o endereço.');
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/company-profile`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível carregar os dados da empresa.');
    const payload = await response.json();
    fillCompanyForm(companyProfileForm, payload.profile);
    if (postalCodeDigits(payload.profile.postalCode).length === 8) {
      setPostalCodeFeedback(document.querySelector('[data-cep-feedback="company"]'), 'Endereço cadastrado. Altere o CEP para buscar novamente.');
    }
    companyLogoDataUrl = null;
    removeCompanyLogo = false;
    renderCompanyLogo(companyLogoPreview, payload.profile.logoConfigured ? `${API_BASE}/v1/company-profile/logo?v=${Date.now()}` : '');
    companyProfileUpdated.textContent = payload.profile.updatedAt
      ? `Atualizado em ${formatDeviceMoment(payload.profile.updatedAt)}`
      : 'Complete o cadastro para personalizar o relatório';
    companyProfileLoaded = true;
  } catch (error) {
    setFormFeedback(companyProfileFeedback, error instanceof Error ? error.message : 'Falha ao carregar cadastro.', true);
  }
}

async function openPlatformCompanyDialog(tenant) {
  platformCompanyForm.reset();
  platformCompanyForm.elements.postalCode.dispatchEvent(new Event('input'));
  setPostalCodeFeedback(document.querySelector('[data-cep-feedback="platform-company"]'), 'Digite o CEP para preencher o endereço.');
  platformCompanyForm.elements.tenantId.value = tenant.id;
  platformCompanyForm.elements.name.value = tenant.name;
  const timezoneSelect = platformCompanyForm.elements.timezone;
  if (![...timezoneSelect.options].some((option) => option.value === tenant.timezone)) {
    const timezoneOption = document.createElement('option');
    timezoneOption.value = tenant.timezone;
    timezoneOption.textContent = tenant.timezone;
    timezoneSelect.append(timezoneOption);
  }
  timezoneSelect.value = tenant.timezone;
  populatePlanSelect(platformCompanyForm.elements.planCode, tenant.plan.code);
  platformCompanyForm.elements.deviceLimitOverride.value = tenant.deviceLimitOverride === null
    ? ''
    : String(tenant.deviceLimitOverride);
  syncCustomLimit(platformCompanyForm.elements.planCode, platformCompanyForm.elements.deviceLimitOverride);
  platformCompanyForm.elements.active.checked = tenant.active;
  platformCompanyForm.elements.active.disabled = tenant.id === currentUser?.tenant?.id;
  platformCompanyForm.elements.active.closest('.client-edit-active').classList.toggle('locked', tenant.id === currentUser?.tenant?.id);
  platformCompanyForm.dataset.tenantName = tenant.name;
  platformCompanyTitle.textContent = `Editar ${tenant.name}`;
  platformCompanyLogoDataUrl = null;
  removePlatformCompanyLogo = false;
  renderCompanyLogo(platformCompanyLogoPreview);
  setFormFeedback(platformCompanyFeedback, 'Carregando dados da empresa…');
  savePlatformCompanyButton.disabled = true;
  platformCompanyDialog.showModal();
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/tenants/${tenant.id}/company-profile`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    if (!response.ok) throw new Error('Não foi possível carregar os dados da empresa.');
    const payload = await response.json();
    fillCompanyForm(platformCompanyForm, payload.profile);
    if (postalCodeDigits(payload.profile.postalCode).length === 8) {
      setPostalCodeFeedback(document.querySelector('[data-cep-feedback="platform-company"]'), 'Endereço cadastrado. Altere o CEP para buscar novamente.');
    }
    renderCompanyLogo(platformCompanyLogoPreview, payload.profile.logoConfigured
      ? `${API_BASE}/v1/platform/tenants/${tenant.id}/company-profile/logo?v=${Date.now()}` : '');
    setFormFeedback(platformCompanyFeedback, '');
    savePlatformCompanyButton.disabled = false;
  } catch (error) {
    setFormFeedback(platformCompanyFeedback, error instanceof Error ? error.message : 'Falha ao carregar cadastro.', true);
  }
}

async function updatePlatformTenant(tenant, row, active) {
  const buttons = [...row.querySelectorAll('button')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/tenants/${tenant.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: tenant.name,
        timezone: tenant.timezone,
        active,
        planCode: tenant.plan.code,
        deviceLimitOverride: tenant.deviceLimitOverride
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        cannot_deactivate_own_tenant: 'O ambiente da sua própria conta não pode ser desativado.',
        limit_below_usage: `O cliente possui ${formatNumber(payload.devicesUsed)} equipamento(s). O novo limite não pode ser menor.`,
        tenant_not_found: 'Este cliente não existe mais.',
        invalid_tenant_update: 'Revise o nome, o plano e o limite personalizado.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível atualizar o cliente.');
    }
    clientsLoaded = false;
    devicesLoaded = false;
    await loadClients();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao atualizar cliente.');
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function openPlatformClientUsersDialog(tenant) {
  platformClientUsersTenantId.value = tenant.id;
  platformClientUsersDialog.dataset.tenantName = tenant.name;
  platformClientUsersTitle.textContent = `Usuários de ${tenant.name}`;
  platformClientUserCreateForm.reset();
  platformClientUserCreateForm.elements.password.type = 'password';
  generatePlatformUserPasswordButton.textContent = 'Gerar senha';
  setFormFeedback(platformClientUserCreateFeedback, '');
  platformClientUsersDialog.showModal();
  void loadPlatformClientUsers();
}

function renderPlatformClientUsers(users) {
  platformClientUsersBody.replaceChildren();
  for (const user of users) {
    const row = document.createElement('tr');
    const ownUser = user.id === currentUser?.id;

    const nameCell = document.createElement('td');
    nameCell.dataset.label = 'Nome';
    const nameInput = document.createElement('input');
    nameInput.value = user.name;
    nameInput.maxLength = 200;
    nameInput.dataset.platformUserName = '';
    nameCell.append(nameInput);

    const emailCell = document.createElement('td');
    emailCell.dataset.label = 'E-mail';
    const emailInput = document.createElement('input');
    emailInput.value = user.email;
    emailInput.type = 'email';
    emailInput.maxLength = 320;
    emailInput.dataset.platformUserEmail = '';
    emailCell.append(emailInput);

    const roleCell = document.createElement('td');
    roleCell.dataset.label = 'Perfil';
    const role = roleSelect(user.role);
    role.dataset.platformUserRole = '';
    role.disabled = ownUser;
    role.title = ownUser ? 'Seu próprio perfil administrativo deve ser preservado' : '';
    roleCell.append(role);

    const statusCell = document.createElement('td');
    statusCell.dataset.label = 'Estado';
    const status = document.createElement('span');
    status.className = `user-status ${user.active ? 'active' : 'inactive'}`;
    status.textContent = user.active ? 'Ativo' : 'Inativo';
    statusCell.append(status);

    const actionsCell = document.createElement('td');
    actionsCell.dataset.label = 'Ações';
    const actions = document.createElement('div');
    actions.className = 'user-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'table-action';
    save.textContent = 'Salvar';
    save.addEventListener('click', () => void updatePlatformClientUser(user, row, user.active));
    const resetPassword = document.createElement('button');
    resetPassword.type = 'button';
    resetPassword.className = 'table-action';
    resetPassword.textContent = 'Redefinir senha';
    resetPassword.addEventListener('click', () => openUserPasswordDialog(user, 'platform'));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `table-action ${user.active ? 'deactivate' : 'activate'}`;
    toggle.textContent = user.active ? 'Desativar' : 'Ativar';
    toggle.disabled = ownUser;
    toggle.title = ownUser ? 'Sua própria conta deve permanecer ativa' : '';
    toggle.addEventListener('click', () => {
      if (user.active && !window.confirm(`Desativar ${user.name}? As sessões atuais serão encerradas imediatamente.`)) return;
      void updatePlatformClientUser(user, row, !user.active);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'table-action danger';
    remove.textContent = 'Excluir';
    remove.disabled = ownUser;
    remove.title = ownUser ? 'Você não pode excluir sua própria conta' : 'Excluir o acesso preservando a auditoria';
    remove.addEventListener('click', () => void deletePlatformClientUser(user, row));
    actions.append(save, resetPassword, toggle, remove);
    actionsCell.append(actions);

    row.append(
      nameCell,
      emailCell,
      roleCell,
      statusCell,
      td(user.lastLoginAt ? formatDeviceMoment(user.lastLoginAt) : 'Nunca acessou', 'Último acesso'),
      actionsCell
    );
    platformClientUsersBody.append(row);
  }
}

async function loadPlatformClientUsers() {
  const tenantId = platformClientUsersTenantId.value;
  if (!tenantId) return;
  platformClientUsersLoading.hidden = false;
  platformClientUsersError.hidden = true;
  platformClientUsersEmpty.hidden = true;
  platformClientUsersTableWrap.hidden = true;
  refreshPlatformClientUsersButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/tenants/${tenantId}/users`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('O serviço de usuários não respondeu corretamente.');
    if (platformClientUsersTenantId.value !== tenantId) return;
    const users = payload.users || [];
    platformClientUserTotal.textContent = formatNumber(users.length);
    platformClientUserActive.textContent = formatNumber(users.filter((user) => user.active).length);
    platformClientUserAdmins.textContent = formatNumber(users.filter((user) => user.active && user.role === 'admin').length);
    renderPlatformClientUsers(users);
    platformClientUsersLoading.hidden = true;
    platformClientUsersEmpty.hidden = users.length > 0;
    platformClientUsersTableWrap.hidden = users.length === 0;
  } catch (error) {
    if (platformClientUsersTenantId.value !== tenantId) return;
    platformClientUsersLoading.hidden = true;
    platformClientUsersError.hidden = false;
    platformClientUsersErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
  } finally {
    refreshPlatformClientUsersButton.disabled = false;
  }
}

async function updatePlatformClientUser(user, row, active) {
  const tenantId = platformClientUsersTenantId.value;
  const nameInput = row.querySelector('[data-platform-user-name]');
  const emailInput = row.querySelector('[data-platform-user-email]');
  const roleInput = row.querySelector('[data-platform-user-role]');
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  if (name.length < 2) {
    window.alert('Informe um nome com pelo menos 2 caracteres.');
    nameInput.focus();
    return;
  }
  if (!emailInput.checkValidity()) {
    emailInput.reportValidity();
    return;
  }
  const fields = [...row.querySelectorAll('input, select, button')];
  fields.forEach((field) => { field.disabled = true; });
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/tenants/${tenantId}/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, email, role: roleInput.value, active })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        email_already_exists: 'Já existe uma conta ativa com este e-mail.',
        cannot_remove_own_admin_access: 'Seu próprio acesso administrativo deve ser preservado.',
        last_active_admin: 'É necessário manter pelo menos um administrador ativo.',
        user_not_found: 'Este usuário não existe mais.',
        invalid_user_update: 'Revise o nome, o e-mail e o perfil.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível atualizar o usuário.');
    }
    clientsLoaded = false;
    await loadPlatformClientUsers();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao atualizar usuário.');
    fields.forEach((field) => { field.disabled = false; });
    if (user.id === currentUser?.id) roleInput.disabled = true;
  }
}

async function deletePlatformClientUser(user, row) {
  if (!window.confirm(`Excluir ${user.name}? O acesso será revogado, mas o histórico de auditoria será preservado.`)) return;
  const tenantId = platformClientUsersTenantId.value;
  const fields = [...row.querySelectorAll('input, select, button')];
  fields.forEach((field) => { field.disabled = true; });
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/tenants/${tenantId}/users/${user.id}`, {
      method: 'DELETE', headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        cannot_delete_own_user: 'Você não pode excluir sua própria conta.',
        last_active_admin: 'É necessário manter pelo menos um administrador ativo.',
        user_not_found: 'Este usuário já foi excluído.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível excluir o usuário.');
    }
    clientsLoaded = false;
    await loadPlatformClientUsers();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao excluir usuário.');
    fields.forEach((field) => { field.disabled = false; });
  }
}

function openUserPasswordDialog(user, scope) {
  platformUserPasswordForm.reset();
  platformUserPasswordForm.elements.userId.value = user.id;
  platformUserPasswordForm.dataset.userEmail = user.email;
  platformUserPasswordForm.dataset.scope = scope;
  platformUserPasswordIdentity.textContent = `${user.name} · ${user.email}`;
  platformUserNewPassword.type = 'password';
  generatePlatformUserNewPasswordButton.textContent = 'Gerar senha';
  setFormFeedback(platformUserPasswordFeedback, '');
  platformUserPasswordDialog.showModal();
  window.setTimeout(() => platformUserNewPassword.focus(), 0);
}

function renderClients(tenants) {
  clientsBody.replaceChildren();
  const canManage = hasPlatformPermission('clients', 'manage');
  for (const tenant of tenants) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.dataset.label = 'Cliente';
    const identity = document.createElement('div');
    identity.className = 'client-table-identity';
    const name = document.createElement('strong');
    name.textContent = tenant.name;
    const timezone = document.createElement('small');
    timezone.textContent = tenant.timezone;
    identity.append(name, timezone);
    nameCell.append(identity);

    const statusCell = document.createElement('td');
    statusCell.dataset.label = 'Estado';
    const status = document.createElement('span');
    const deleting = ['pending', 'running'].includes(tenant.deletionStatus);
    const deletionFailed = tenant.deletionStatus === 'failed';
    status.className = `user-status ${tenant.active && !tenant.deletionStatus ? 'active' : 'inactive'}`;
    status.textContent = deleting
      ? tenant.deletionStatus === 'running' ? 'Excluindo dados' : 'Exclusão pendente'
      : deletionFailed ? 'Falha na exclusão' : tenant.active ? 'Ativo' : 'Inativo';
    statusCell.append(status);

    const planCell = document.createElement('td');
    planCell.dataset.label = 'Plano';
    const plan = document.createElement('div');
    plan.className = 'client-table-plan';
    const planName = document.createElement('strong');
    planName.textContent = tenant.plan.name;
    const planCode = document.createElement('small');
    planCode.textContent = tenant.plan.code;
    plan.append(planName, planCode);
    planCell.append(plan);

    const limitCell = document.createElement('td');
    limitCell.dataset.label = 'Limite personalizado';
    limitCell.textContent = tenant.deviceLimitOverride === null
      ? 'Conforme o plano'
      : `${formatNumber(tenant.deviceLimitOverride)} equipamento(s)`;

    const usage = tenant.plan.deviceLimit === null
      ? `${formatNumber(tenant.plan.devicesUsed)} / sem limite`
      : `${formatNumber(tenant.plan.devicesUsed)} / ${formatNumber(tenant.plan.deviceLimit)}`;
    const actionsCell = document.createElement('td');
    actionsCell.dataset.label = 'Ações';
    const actions = document.createElement('div');
    actions.className = 'user-actions';
    const access = document.createElement('button');
    access.type = 'button';
    access.className = 'platform-access-button';
    access.textContent = 'Acessar ambiente';
    access.disabled = !tenant.active || Boolean(tenant.deletionStatus);
    access.addEventListener('click', () => void changeTenantContext(tenant.id, access));
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'table-action';
    edit.textContent = 'Editar cadastro';
    edit.addEventListener('click', () => void openPlatformCompanyDialog(tenant));
    const manageUsers = document.createElement('button');
    manageUsers.type = 'button';
    manageUsers.className = 'table-action';
    manageUsers.textContent = 'Gerenciar usuários';
    manageUsers.addEventListener('click', () => openPlatformClientUsersDialog(tenant));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `table-action ${tenant.active ? 'deactivate' : 'activate'}`;
    toggle.textContent = tenant.active ? 'Desativar' : 'Ativar';
    toggle.disabled = tenant.id === currentUser?.tenant?.id && tenant.active;
    toggle.title = toggle.disabled ? 'Seu próprio ambiente deve permanecer ativo' : '';
    toggle.addEventListener('click', () => {
      if (tenant.active && !window.confirm(`Desativar ${tenant.name}? Usuários e coletores perderão o acesso imediatamente.`)) return;
      void updatePlatformTenant(tenant, row, !tenant.active);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'table-action danger';
    remove.textContent = 'Excluir dados';
    remove.disabled = tenant.id === currentUser?.tenant?.id || Boolean(tenant.deletionStatus);
    remove.title = tenant.id === currentUser?.tenant?.id ? 'O tenant da sua própria conta não pode ser excluído' : '';
    remove.addEventListener('click', () => openDeleteClientDialog(tenant));
    edit.disabled = Boolean(tenant.deletionStatus);
    manageUsers.disabled = Boolean(tenant.deletionStatus);
    toggle.disabled = toggle.disabled || Boolean(tenant.deletionStatus);
    if (canManage) actions.append(access, edit, manageUsers, toggle, remove);
    else {
      const readOnly = document.createElement('span');
      readOnly.className = 'access-profile-read-only';
      readOnly.textContent = 'Somente visualização';
      actions.append(readOnly);
    }
    if (canManage && deletionFailed && tenant.deletionJobId) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'table-action activate';
      retry.textContent = 'Repetir exclusão';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        try {
          const response = await authenticatedFetch(`${API_BASE}/v1/platform/deletions/${tenant.deletionJobId}/retry`, {
            method: 'POST', headers: { Accept: 'application/json' }
          });
          if (!response.ok) throw new Error('A exclusão não pôde ser reagendada.');
          clientsLoaded = false;
          await loadClients();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Falha ao reagendar exclusão.');
          retry.disabled = false;
        }
      });
      actions.append(retry);
    }
    actionsCell.append(actions);
    row.append(
      nameCell,
      statusCell,
      planCell,
      limitCell,
      td(usage, 'Uso'),
      td(formatNumber(tenant.collectorCount), 'Coletores'),
      td(formatNumber(tenant.userCount), 'Usuários'),
      actionsCell
    );
    clientsBody.append(row);
  }
}

function openDeleteClientDialog(tenant) {
  deleteClientForm.reset();
  deleteClientForm.elements.tenantId.value = tenant.id;
  deleteClientName.textContent = tenant.name;
  deleteClientForm.dataset.tenantName = tenant.name;
  const remote = clientDeletionPolicy?.remoteBackupConfigured
    ? ' Há também uma cópia externa cuja retenção deve ser tratada no servidor remoto.'
    : '';
  deleteClientBackupNotice.textContent = `Os backups locais compartilhados podem manter uma cópia por até ${formatNumber(clientDeletionPolicy?.localBackupRetentionDays ?? 35)} dias.${remote}`;
  setFormFeedback(deleteClientFeedback, '');
  deleteClientDialog.showModal();
  window.setTimeout(() => deleteClientForm.elements.confirmation.focus(), 0);
}

function populatePlatformAuditTenantFilter(tenants) {
  const selected = platformAuditTenant.value;
  platformAuditTenant.replaceChildren();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'Todos os clientes';
  platformAuditTenant.append(all);
  for (const tenant of tenants) {
    const option = document.createElement('option');
    option.value = tenant.id;
    option.textContent = tenant.name;
    option.selected = tenant.id === selected;
    platformAuditTenant.append(option);
  }
}

function platformAuditQuery() {
  const query = new URLSearchParams({ action: platformAuditAction.value, limit: '100' });
  if (platformAuditTenant.value) query.set('tenantId', platformAuditTenant.value);
  return query;
}

function platformAuditActionLabel(action) {
  return {
    created: 'Cliente criado',
    updated: 'Cadastro atualizado',
    activated: 'Cliente ativado',
    deactivated: 'Cliente desativado',
    plan_changed: 'Plano alterado',
    exported: 'Auditoria exportada',
    plan_created: 'Plano criado',
    plan_updated: 'Plano editado',
    plan_deleted: 'Plano excluído',
    tenant_deletion_requested: 'Exclusão solicitada',
    tenant_deleted: 'Cliente excluído',
    tenant_deletion_failed: 'Falha na exclusão',
    email_settings_updated: 'SMTP atualizado',
    email_tested: 'SMTP testado',
    company_profile_updated: 'Dados da empresa atualizados',
    tenant_accessed: 'Ambiente acessado',
    tenant_access_ended: 'Acesso encerrado',
    access_profile_created: 'Perfil de acesso criado',
    access_profile_updated: 'Perfil de acesso atualizado',
    access_profile_deleted: 'Perfil de acesso excluído',
    integration_provider_enabled: 'Integração disponibilizada',
    integration_provider_disabled: 'Integração ocultada'
  }[action] || action;
}

function platformAuditDetail(event) {
  const details = event.details || {};
  if (event.action === 'exported') {
    return `${formatNumber(Number(details.resultCount || 0))} evento(s) · CSV · hash ${String(details.sha256 || '').slice(0, 16)}…`;
  }
  if (event.action === 'email_settings_updated') {
    return `${details.enabled ? 'Ativado' : 'Desativado'} · ${details.host || 'sem servidor'}:${details.port || '—'} · ${details.secure ? 'TLS direto' : 'STARTTLS/automática'}`;
  }
  if (event.action === 'email_tested') {
    return `${details.recipient || 'destinatário não informado'} · ${details.status === 'success' ? 'entregue' : 'falhou'}`;
  }
  if (event.action === 'company_profile_updated') {
    return `${details.legalName || event.targetTenantName || 'Cliente'} · CNPJ ${details.cnpjConfigured ? 'informado' : 'não informado'}${details.logoChanged ? ' · logotipo alterado' : ''}`;
  }
  if (event.action === 'tenant_accessed') return `Entrada administrativa em ${event.targetTenantName || 'cliente'}`;
  if (event.action === 'tenant_access_ended') return `Retorno à gestão da plataforma após acessar ${event.targetTenantName || 'cliente'}`;
  if (String(event.action).startsWith('access_profile_')) {
    return `${details.name || 'Perfil'} · permissões por menu atualizadas`;
  }
  if (String(event.action).startsWith('integration_provider_')) {
    return `${details.provider === 'elleven' ? 'Elleven · Grupo Voalle' : details.provider || 'Integração'} · ${details.enabled ? 'disponível para clientes' : 'oculta para clientes'}`;
  }
  const plan = details.planCode ? ` · plano ${details.planCode}` : '';
  const limit = details.deviceLimit === null
    ? details.planCode ? ' · sem limite' : ''
    : details.deviceLimit !== undefined ? ` · limite ${formatNumber(Number(details.deviceLimit))}` : '';
  const previous = details.previousPlanCode && details.previousPlanCode !== details.planCode
    ? ` · anterior ${details.previousPlanCode}`
    : '';
  return `${details.name || details.previousName || event.targetTenantName || 'Cliente'}${plan}${limit}${previous}`;
}

function renderPlatformAudit(events) {
  platformAuditBody.replaceChildren();
  for (const event of events) {
    const row = document.createElement('tr');
    const actionCell = td(platformAuditActionLabel(event.action), 'Ação', 'audit-action');
    const detailCell = td(platformAuditDetail(event), 'Detalhes', 'audit-details');
    const idCell = td(event.id, 'ID', 'audit-id');
    idCell.title = event.id;
    row.append(
      td(formatDeviceMoment(event.createdAt), 'Data e horário'),
      td(event.targetTenantName || 'Todos os clientes', 'Cliente'),
      td(`${event.actorName} · ${event.actorEmail}`, 'Administrador'),
      actionCell,
      detailCell,
      idCell
    );
    platformAuditBody.append(row);
  }
}

async function loadPlatformAudit() {
  platformAuditLoading.hidden = false;
  platformAuditError.hidden = true;
  platformAuditEmpty.hidden = true;
  platformAuditTableWrap.hidden = true;
  platformAuditTenant.disabled = true;
  platformAuditAction.disabled = true;
  exportPlatformAuditButton.disabled = true;
  refreshPlatformAuditButton.disabled = true;
  try {
    if (platformAuditTenant.options.length <= 1) {
      const tenantsResponse = await authenticatedFetch(`${API_BASE}/v1/platform/audit/tenants`, {
        headers: { Accept: 'application/json' }, cache: 'no-store'
      });
      const tenantsPayload = await tenantsResponse.json().catch(() => ({}));
      if (!tenantsResponse.ok) throw new Error('Não foi possível carregar os clientes para o filtro.');
      populatePlatformAuditTenantFilter(tenantsPayload.tenants);
    }
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/audit?${platformAuditQuery().toString()}`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('O histórico da plataforma não respondeu corretamente.');
    renderPlatformAudit(payload.events);
    platformAuditEvents.textContent = formatNumber(payload.summary.events24h);
    platformAuditCreated.textContent = formatNumber(payload.summary.created24h);
    platformAuditPlanChanges.textContent = formatNumber(payload.summary.planChanges24h);
    platformAuditAccessChanges.textContent = formatNumber(payload.summary.accessChanges24h);
    platformAuditGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)} · ${formatNumber(payload.summary.events24h)} evento(s) em 24 h`;
    platformAuditLoading.hidden = true;
    platformAuditEmpty.hidden = payload.events.length !== 0;
    platformAuditTableWrap.hidden = payload.events.length === 0;
    auditLoaded = true;
  } catch (error) {
    platformAuditLoading.hidden = true;
    if (!appShell.hidden) {
      platformAuditError.hidden = false;
      platformAuditErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    platformAuditTenant.disabled = false;
    platformAuditAction.disabled = false;
    exportPlatformAuditButton.disabled = false;
    refreshPlatformAuditButton.disabled = false;
  }
}

function integrationEndpoint(path = '') {
  const tenantId = isPlatformContext() ? integrationTenant.value : '';
  const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  return `${API_BASE}/v1/integrations/elleven${path}${query}`;
}

async function loadIntegrationProviderAvailability() {
  if (isPlatformContext()) return;
  const userAtRequest = currentUser;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/integrations/catalog`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('Catálogo indisponível');
    if (currentUser !== userAtRequest || isPlatformContext()) return;
    integrationProviderAvailability = Boolean(payload.providers?.some((item) => item.provider === 'elleven' && item.enabled));
    integrationsNav.hidden = currentUser?.role !== 'admin' || !integrationProviderAvailability;
    erpQueryOption.hidden = !integrationProviderAvailability;
    if (!integrationProviderAvailability) erpQueryOption.querySelector('input').checked = false;
    if (!integrationProviderAvailability && !integrationsView.hidden) {
      window.history.replaceState(null, '', '#dashboard');
      navigateTo('dashboard');
    }
  } catch {
    if (currentUser !== userAtRequest) return;
    integrationProviderAvailability = false;
    integrationsNav.hidden = true;
    erpQueryOption.hidden = true;
    erpQueryOption.querySelector('input').checked = false;
    if (!integrationsView.hidden) {
      window.history.replaceState(null, '', '#dashboard');
      navigateTo('dashboard');
    }
  }
}

function renderPlatformIntegrationProvider(item) {
  const enabled = Boolean(item?.enabled);
  platformEllevenEnabled.checked = enabled;
  platformEllevenConfigured.textContent = formatNumber(Number(item?.configuredTenants || 0));
  platformEllevenActive.textContent = `${formatNumber(Number(item?.enabledTenants || 0))} com integração ativa`;
  platformEllevenActionLabel.textContent = enabled ? 'Disponível para clientes' : 'Oculta para clientes';
  platformEllevenFeedback.textContent = enabled
    ? 'Os clientes podem adicionar e configurar esta integração.'
    : 'O menu não aparece para os clientes e a utilização fica bloqueada.';
  platformIntegrationsUpdated.textContent = item?.updatedAt
    ? `Atualizado em ${formatDeviceMoment(item.updatedAt)}`
    : 'Configuração padrão da plataforma';
}

async function loadPlatformIntegrations() {
  platformIntegrationsLoading.hidden = false;
  platformIntegrationsError.hidden = true;
  platformIntegrationCatalog.hidden = true;
  platformEllevenEnabled.disabled = !hasPlatformPermission('integrations', 'manage');
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/integrations`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('O catálogo de integrações não respondeu corretamente.');
    renderPlatformIntegrationProvider(payload.providers?.find((item) => item.provider === 'elleven'));
    platformIntegrationCatalog.hidden = false;
    integrationsLoaded = true;
  } catch (error) {
    platformIntegrationsError.hidden = false;
    platformIntegrationsErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
  } finally {
    platformIntegrationsLoading.hidden = true;
  }
}

async function updatePlatformIntegrationAvailability(enabled) {
  platformEllevenEnabled.disabled = true;
  platformEllevenFeedback.textContent = enabled ? 'Liberando a integração para os clientes…' : 'Ocultando a integração dos clientes…';
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/integrations/elleven`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ enabled })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('Não foi possível alterar a disponibilidade da integração.');
    renderPlatformIntegrationProvider(payload.provider);
  } catch (error) {
    platformEllevenEnabled.checked = !enabled;
    platformEllevenFeedback.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
  } finally {
    platformEllevenEnabled.disabled = !hasPlatformPermission('integrations', 'manage');
  }
}

function setIntegrationTestState(element, test) {
  element.classList.remove('success', 'failed');
  if (!test) {
    element.textContent = 'Não testado';
    return;
  }
  element.classList.add(test.status);
  element.textContent = test.status === 'success'
    ? `Testado · ${formatDeviceMoment(test.testedAt)}`
    : 'Teste com falha';
  element.title = test.message || '';
}

function renderIntegration(integration) {
  currentIntegration = integration;
  const radius = integration.radius;
  const voalleDatabase = integration.voalleDatabase;
  const form = ellevenIntegrationForm.elements;
  form.radiusAccessMode.value = radius.accessMode || 'cloud';
  form.radiusHost.value = radius.host || '';
  form.radiusPort.value = radius.port || 5432;
  form.radiusDatabase.value = radius.database || '';
  form.radiusSchema.value = radius.schema || 'public';
  form.radiusUsername.value = radius.username || '';
  form.radiusPassword.value = '';
  form.radiusPassword.placeholder = radius.passwordConfigured ? 'Senha mantida · digite para trocar' : 'Digite para configurar';
  form.radiusSslMode.value = radius.sslMode || 'disable';
  form.voalleDatabaseHost.value = voalleDatabase.host || '';
  form.voalleDatabasePort.value = voalleDatabase.port || 5432;
  form.voalleDatabaseName.value = voalleDatabase.database || '';
  form.voalleDatabaseSchema.value = voalleDatabase.schema || 'public';
  form.voalleDatabaseUsername.value = voalleDatabase.username || '';
  form.voalleDatabasePassword.value = '';
  form.voalleDatabasePassword.placeholder = voalleDatabase.passwordConfigured ? 'Senha mantida · digite para trocar' : 'Digite para configurar';
  form.voalleDatabaseSslMode.value = voalleDatabase.sslMode || 'disable';
  form.enabled.checked = integration.enabled;

  setIntegrationTestState(radiusTestState, radius.lastTest);
  setIntegrationTestState(voalleDatabaseTestState, voalleDatabase.lastTest);

  integrationStatePill.classList.remove('success', 'warning');
  if (integration.enabled && integration.mappingStatus === 'awaiting_radius_mapping') {
    integrationStatePill.textContent = 'Ativa · aguardando mapeamento';
    integrationStatePill.classList.add('warning');
  } else if (radius.lastTest?.status === 'success' && voalleDatabase.lastTest?.status === 'success') {
    integrationStatePill.textContent = integration.enabled ? 'Ativa' : 'Desativada';
    integrationStatePill.classList.add(integration.enabled ? 'success' : 'warning');
  } else if (integration.configured) {
    integrationStatePill.textContent = 'Configuração pendente';
    integrationStatePill.classList.add('warning');
  } else {
    integrationStatePill.textContent = 'Não configurada';
  }

  const candidates = radius.candidates || [];
  radiusCandidates.replaceChildren();
  if (radius.lastTest?.status === 'success') {
    radiusDiscovery.hidden = false;
    if (candidates.length) {
      candidates.forEach((candidate) => {
        const pill = document.createElement('span');
        pill.className = 'radius-candidate';
        pill.textContent = `${candidate.schema}.${candidate.table}`;
        pill.title = candidate.columns.join(', ');
        radiusCandidates.append(pill);
      });
    } else {
      const empty = document.createElement('span');
      empty.className = 'radius-candidate';
      empty.textContent = 'Nenhuma tabela candidata';
      radiusCandidates.append(empty);
    }
  } else {
    radiusDiscovery.hidden = true;
  }
  const voalleCandidates = voalleDatabase.candidates || [];
  voalleDatabaseCandidates.replaceChildren();
  if (voalleDatabase.lastTest?.status === 'success') {
    voalleDatabaseDiscovery.hidden = false;
    if (voalleCandidates.length) {
      voalleCandidates.forEach((candidate) => {
        const pill = document.createElement('span');
        pill.className = 'radius-candidate';
        pill.textContent = `${candidate.schema}.${candidate.table}`;
        pill.title = candidate.columns.join(', ');
        voalleDatabaseCandidates.append(pill);
      });
    } else {
      const empty = document.createElement('span');
      empty.className = 'radius-candidate';
      empty.textContent = 'Nenhuma tabela candidata';
      voalleDatabaseCandidates.append(empty);
    }
  } else {
    voalleDatabaseDiscovery.hidden = true;
  }
  radiusTestFeedback.hidden = true;
  voalleDatabaseTestFeedback.hidden = true;
  integrationLastUpdate.textContent = integration.updatedAt ? `Atualizada em ${formatDeviceMoment(integration.updatedAt)}` : 'Ainda não atualizada';
  integrationRadiusCheck.textContent = radius.lastTest?.status === 'success' ? '✓ RADIUS validado' : radius.lastTest?.status === 'failed' ? '! RADIUS com falha' : '○ RADIUS pendente';
  integrationVoalleDatabaseCheck.textContent = voalleDatabase.lastTest?.status === 'success' ? '✓ Voalle DB validado' : voalleDatabase.lastTest?.status === 'failed' ? '! Voalle DB com falha' : '○ Voalle DB pendente';
  integrationRadiusCheck.className = radius.lastTest?.status || '';
  integrationVoalleDatabaseCheck.className = voalleDatabase.lastTest?.status || '';
  integrationsEmpty.hidden = integration.configured;
  integrationList.hidden = !integration.configured;
  selectEllevenIntegrationButton.disabled = integration.configured;
  selectEllevenIntegrationButton.classList.toggle('configured', integration.configured);
  selectEllevenIntegrationButton.querySelector('em').textContent = integration.configured ? 'Já adicionada' : 'Disponível';
  updateIntegrationReview();
}

function updateIntegrationReview() {
  const radiusTest = currentIntegration?.radius?.lastTest;
  const voalleDatabaseTest = currentIntegration?.voalleDatabase?.lastTest;
  integrationReviewRadius.textContent = radiusTest?.status === 'success' ? 'Conexão validada' : radiusTest?.status === 'failed' ? 'Teste com falha' : 'Não testado';
  integrationReviewRadiusDetail.textContent = currentIntegration?.radius?.host
    ? `${currentIntegration.radius.host}:${currentIntegration.radius.port}` : 'Servidor não informado';
  integrationReviewVoalleDatabase.textContent = voalleDatabaseTest?.status === 'success' ? 'Conexão validada' : voalleDatabaseTest?.status === 'failed' ? 'Teste com falha' : 'Não testado';
  integrationReviewVoalleDatabaseDetail.textContent = currentIntegration?.voalleDatabase?.host
    ? `${currentIntegration.voalleDatabase.host}:${currentIntegration.voalleDatabase.port}` : 'Servidor não informado';
}

function setIntegrationWizardStep(step) {
  integrationWizardStep = Math.max(1, Math.min(3, step));
  integrationWizardSteps.forEach((section) => { section.hidden = Number(section.dataset.integrationStep) !== integrationWizardStep; });
  integrationWizardIndicators.forEach((indicator) => {
    const number = Number(indicator.dataset.integrationStepIndicator);
    indicator.classList.toggle('active', number === integrationWizardStep);
    indicator.classList.toggle('completed', number < integrationWizardStep);
  });
  integrationWizardBackButton.hidden = integrationWizardStep === 1;
  integrationWizardNextButton.hidden = integrationWizardStep === 3;
  saveIntegrationButton.hidden = integrationWizardStep !== 3;
  if (integrationWizardStep === 3) {
    updateIntegrationReview();
    if (!integrationWizardEditing && currentIntegration?.radius?.lastTest?.status === 'success'
      && currentIntegration?.voalleDatabase?.lastTest?.status === 'success') {
      ellevenIntegrationForm.elements.enabled.checked = true;
    }
  }
}

function openIntegrationCatalog() {
  integrationCatalogDialog.showModal();
}

function openIntegrationWizard(editing = false) {
  integrationWizardEditing = editing;
  integrationWizardMode.textContent = editing ? 'Editar integração' : 'Nova integração';
  setFormFeedback(integrationSaveFeedback, '');
  setIntegrationWizardStep(1);
  integrationWizardDialog.showModal();
}

async function loadIntegrationTargets() {
  integrationTarget.hidden = !isPlatformContext();
  if (!isPlatformContext() || integrationTargetsLoaded) return;
  const response = await authenticatedFetch(`${API_BASE}/v1/platform/tenants`, {
    headers: { Accept: 'application/json' }, cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Não foi possível carregar os clientes da plataforma.');
  const previous = integrationTenant.value;
  integrationTenant.replaceChildren(...payload.tenants.map((tenant) => {
    const option = document.createElement('option');
    option.value = tenant.id;
    option.textContent = `${tenant.name}${tenant.active ? '' : ' · desativado'}`;
    return option;
  }));
  if (!payload.tenants.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Nenhum cliente disponível';
    integrationTenant.append(option);
  }
  if ([...integrationTenant.options].some((option) => option.value === previous)) integrationTenant.value = previous;
  integrationTargetsLoaded = true;
}

async function loadIntegrations() {
  integrationsLoading.hidden = false;
  integrationsError.hidden = true;
  integrationsEmpty.hidden = true;
  integrationList.hidden = true;
  integrationTenant.disabled = true;
  try {
    await loadIntegrationTargets();
    const response = await authenticatedFetch(integrationEndpoint(), {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 403
      ? 'Somente administradores podem configurar integrações.'
      : 'O serviço de integrações não respondeu corretamente.');
    renderIntegration(payload.integration);
    ellevenIntegrationForm.hidden = false;
    integrationsLoaded = true;
    integrationsLoading.hidden = true;
  } catch (error) {
    integrationsLoading.hidden = true;
    integrationsError.hidden = false;
    integrationsErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
  } finally {
    integrationTenant.disabled = false;
  }
}

function integrationPayload() {
  const form = ellevenIntegrationForm.elements;
  return {
    enabled: form.enabled.checked,
    radius: {
      accessMode: form.radiusAccessMode.value,
      collectorId: null,
      host: form.radiusHost.value.trim(),
      port: Number(form.radiusPort.value || 5432),
      database: form.radiusDatabase.value.trim(),
      schema: form.radiusSchema.value.trim() || 'public',
      username: form.radiusUsername.value.trim(),
      password: form.radiusPassword.value,
      sslMode: form.radiusSslMode.value
    },
    voalleDatabase: {
      host: form.voalleDatabaseHost.value.trim(),
      port: Number(form.voalleDatabasePort.value || 5432),
      database: form.voalleDatabaseName.value.trim(),
      schema: form.voalleDatabaseSchema.value.trim() || 'public',
      username: form.voalleDatabaseUsername.value.trim(),
      password: form.voalleDatabasePassword.value,
      sslMode: form.voalleDatabaseSslMode.value
    }
  };
}

function integrationErrorMessage(payload, fallback) {
  const messages = {
    integration_configuration_incomplete: 'Preencha as duas conexões e suas credenciais antes de habilitar a integração.',
    radius_not_configured: 'Preencha e salve todos os campos do RADIUS antes do teste.',
    voalle_database_not_configured: 'Preencha e salve todos os campos do Voalle Database antes do teste.',
    collector_radius_test_pending: 'O teste via coletor local será habilitado na próxima etapa.'
  };
  return payload.message || messages[payload.error] || fallback;
}

async function saveIntegration({ quiet = false } = {}) {
  setButtonLoading(saveIntegrationButton, true);
  if (!quiet) setFormFeedback(integrationSaveFeedback, 'Salvando configuração…');
  try {
    const response = await authenticatedFetch(integrationEndpoint(), {
      method: 'PUT',
      headers: { Accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(integrationPayload())
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(integrationErrorMessage(payload, 'Não foi possível salvar a integração.'));
    renderIntegration(payload.integration);
    integrationsLoaded = true;
    if (!quiet) setFormFeedback(integrationSaveFeedback, 'Configuração salva com segurança. As senhas não são exibidas pelo LogVault.');
    return payload.integration;
  } catch (error) {
    setFormFeedback(integrationSaveFeedback, error instanceof Error ? error.message : 'Falha ao salvar.', true);
    return null;
  } finally {
    setButtonLoading(saveIntegrationButton, false);
  }
}

async function testIntegrationSource(source) {
  const button = source === 'radius' ? testRadiusButton : testVoalleDatabaseButton;
  const feedback = source === 'radius' ? radiusTestFeedback : voalleDatabaseTestFeedback;
  setButtonLoading(button, true);
  setFormFeedback(feedback, 'Salvando e iniciando teste…');
  try {
    const saved = await saveIntegration({ quiet: true });
    if (!saved) throw new Error('Revise a configuração antes de testar.');
    const testPath = source === 'radius' ? '/test-radius' : '/test-voalle-database';
    const response = await authenticatedFetch(integrationEndpoint(testPath), {
      method: 'POST', headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (payload.integration) renderIntegration(payload.integration);
    if (!response.ok) throw new Error(integrationErrorMessage(payload, 'O teste de conexão falhou.'));
    setFormFeedback(feedback, `Conexão aprovada. ${payload.candidates.length} tabela(s) candidata(s) encontrada(s).`);
  } catch (error) {
    setFormFeedback(feedback, error instanceof Error ? error.message : 'Falha no teste.', true);
  } finally {
    setButtonLoading(button, false);
  }
}

async function removeIntegration() {
  const response = await authenticatedFetch(integrationEndpoint(), {
    method: 'DELETE', headers: { Accept: 'application/json' }
  });
  if (response.ok) return;
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.error === 'integration_not_configured'
    ? 'A integração já foi removida.' : 'Não foi possível excluir a integração.');
}

async function loadClients() {
  clientsLoading.hidden = false;
  clientsError.hidden = true;
  clientsTableWrap.hidden = true;
  plansLoading.hidden = false;
  plansError.hidden = true;
  plansTableWrap.hidden = true;
  refreshClientsButton.disabled = true;
  refreshPlansButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/tenants`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 403 ? 'Somente administradores da plataforma podem acessar os clientes.' : 'O serviço de clientes não respondeu corretamente.');
    availablePlans = payload.plans;
    clientDeletionPolicy = payload.deletionPolicy;
    const selectedPlan = createClientForm.elements.planCode.value;
    populatePlanSelect(createClientForm.elements.planCode, selectedPlan);
    syncCustomLimit(createClientForm.elements.planCode, createClientForm.elements.deviceLimitOverride);
    updateClientPlanPreview();
    openClientWizardButton.disabled = false;
    clientTotal.textContent = formatNumber(payload.summary.total);
    clientActive.textContent = formatNumber(payload.summary.active);
    clientDevices.textContent = formatNumber(payload.summary.devices);
    clientCollectors.textContent = formatNumber(payload.summary.collectors);
    clientsGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    planTotal.textContent = formatNumber(payload.plans.length);
    planAssigned.textContent = formatNumber(payload.plans.reduce((total, plan) => total + plan.assignedTenants, 0));
    planLimited.textContent = formatNumber(payload.plans.filter((plan) => plan.deviceLimit !== null).length);
    planUnlimited.textContent = formatNumber(payload.plans.filter((plan) => plan.deviceLimit === null).length);
    plansGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    populatePlatformAuditTenantFilter(payload.tenants);
    renderPlans(payload.plans);
    plansLoaded = true;
    renderClients(payload.tenants);
    clientsLoaded = true;
    clientsLoading.hidden = true;
    clientsTableWrap.hidden = false;
    plansLoading.hidden = true;
    plansTableWrap.hidden = false;
    if (clientsPollTimer) window.clearTimeout(clientsPollTimer);
    clientsPollTimer = payload.tenants.some((tenant) => ['pending', 'running'].includes(tenant.deletionStatus))
      ? window.setTimeout(() => {
        clientsLoaded = false;
        void loadClients();
      }, 3000)
      : null;
  } catch (error) {
    clientsLoading.hidden = true;
    plansLoading.hidden = true;
    if (!appShell.hidden) {
      clientsError.hidden = false;
      clientsErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
      plansError.hidden = false;
      plansErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshClientsButton.disabled = false;
    refreshPlansButton.disabled = false;
  }
}

async function loadPlans() {
  plansLoading.hidden = false;
  plansError.hidden = true;
  plansTableWrap.hidden = true;
  refreshPlansButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/plans`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 403
      ? 'Seu perfil não possui acesso aos planos.'
      : 'O serviço de planos não respondeu corretamente.');
    availablePlans = payload.plans;
    planTotal.textContent = formatNumber(payload.plans.length);
    planAssigned.textContent = formatNumber(payload.plans.reduce((total, plan) => total + plan.assignedTenants, 0));
    planLimited.textContent = formatNumber(payload.plans.filter((plan) => plan.deviceLimit !== null).length);
    planUnlimited.textContent = formatNumber(payload.plans.filter((plan) => plan.deviceLimit === null).length);
    plansGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(payload.generatedAt)}`;
    renderPlans(payload.plans);
    plansLoaded = true;
    plansLoading.hidden = true;
    plansTableWrap.hidden = false;
  } catch (error) {
    plansLoading.hidden = true;
    if (!appShell.hidden) {
      plansError.hidden = false;
      plansErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshPlansButton.disabled = false;
  }
}

function updatePlatformEmailMasterState() {
  const enabled = platformEmailForm.elements.enabled.checked;
  platformEmailMasterState.textContent = enabled ? 'Ativada' : 'Desativada';
}

function renderPlatformEmailSettings(settings) {
  platformEmailForm.elements.enabled.checked = settings.enabled;
  platformEmailForm.elements.host.value = settings.host || '';
  platformEmailForm.elements.port.value = settings.port || 587;
  platformEmailForm.elements.secure.value = String(Boolean(settings.secure));
  platformEmailForm.elements.user.value = settings.user || '';
  platformEmailForm.elements.password.value = '';
  platformEmailForm.elements.password.type = 'password';
  toggleSmtpPasswordButton.textContent = 'Mostrar';
  toggleSmtpPasswordButton.setAttribute('aria-label', 'Mostrar senha SMTP');
  platformEmailForm.elements.from.value = settings.from || '';
  platformEmailForm.elements.password.placeholder = settings.passwordConfigured
    ? 'Senha configurada — deixe em branco para manter'
    : 'Informe a senha';
  smtpPasswordHelp.textContent = settings.passwordConfigured
    ? 'Existe uma senha protegida. Deixe em branco para mantê-la.'
    : 'Deixe em branco se o servidor não exigir autenticação.';
  platformEmailStatus.textContent = settings.enabled ? 'Ativada' : 'Desativada';
  platformEmailStatus.classList.toggle('summary-good', settings.enabled);
  platformEmailStatus.classList.toggle('summary-warning', !settings.enabled);
  platformEmailSource.textContent = settings.source === 'environment'
    ? 'carregada do arquivo de ambiente' : 'configuração salva na plataforma';
  platformEmailServer.textContent = settings.host ? `${settings.host}:${settings.port}` : 'Não configurado';
  platformEmailSecurity.textContent = settings.secure ? 'TLS direto' : 'STARTTLS ou conexão automática';
  platformEmailFrom.textContent = settings.from || 'Não configurado';
  platformEmailLastTest.classList.remove('summary-good', 'summary-warning');
  if (settings.lastTestAt) {
    platformEmailLastTest.textContent = formatDeviceMoment(settings.lastTestAt);
    platformEmailTestStatus.textContent = settings.lastTestStatus === 'success'
      ? 'mensagem entregue com sucesso' : `falhou: ${settings.lastTestError || 'erro não informado'}`;
    platformEmailLastTest.classList.add(settings.lastTestStatus === 'success' ? 'summary-good' : 'summary-warning');
  } else {
    platformEmailLastTest.textContent = 'Nunca testado';
    platformEmailTestStatus.textContent = 'envie um teste após salvar';
  }
  platformEmailUpdated.textContent = settings.updatedAt
    ? `Atualizado em ${formatDeviceMoment(settings.updatedAt)}`
    : settings.source === 'environment' ? 'Configuração inicial do servidor' : 'Ainda não configurado';
  testPlatformEmailButton.disabled = !settings.host || !settings.from;
  updatePlatformEmailMasterState();
}

async function loadPlatformEmailSettings() {
  platformEmailLoading.hidden = false;
  platformEmailError.hidden = true;
  platformEmailForm.hidden = true;
  refreshPlatformEmailButton.disabled = true;
  setFormFeedback(platformEmailFeedback, '');
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/email-settings`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 403
      ? 'Somente administradores da plataforma podem alterar o SMTP.'
      : 'O serviço de configuração de e-mail não respondeu corretamente.');
    renderPlatformEmailSettings(payload.settings);
    if (!platformEmailTestForm.elements.recipient.value) {
      platformEmailTestForm.elements.recipient.value = currentUser?.email || '';
    }
    platformEmailLoaded = true;
    platformEmailLoading.hidden = true;
    platformEmailForm.hidden = false;
  } catch (error) {
    platformEmailLoading.hidden = true;
    if (!appShell.hidden) {
      platformEmailError.hidden = false;
      platformEmailErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshPlatformEmailButton.disabled = false;
  }
}

platformEmailForm.elements.enabled.addEventListener('change', updatePlatformEmailMasterState);

toggleSmtpPasswordButton.addEventListener('click', () => {
  const password = platformEmailForm.elements.password;
  const showing = password.type === 'text';
  password.type = showing ? 'password' : 'text';
  toggleSmtpPasswordButton.textContent = showing ? 'Mostrar' : 'Ocultar';
  toggleSmtpPasswordButton.setAttribute('aria-label', showing ? 'Mostrar senha SMTP' : 'Ocultar senha SMTP');
  password.focus();
});

platformEmailForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!platformEmailForm.reportValidity()) return;
  setFormFeedback(platformEmailFeedback, '');
  setButtonLoading(savePlatformEmailButton, true);
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/email-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        enabled: platformEmailForm.elements.enabled.checked,
        host: platformEmailForm.elements.host.value.trim(),
        port: Number(platformEmailForm.elements.port.value),
        secure: platformEmailForm.elements.secure.value === 'true',
        user: platformEmailForm.elements.user.value.trim(),
        password: platformEmailForm.elements.password.value,
        from: platformEmailForm.elements.from.value.trim()
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error === 'smtp_password_required'
        ? 'Informe a senha usada pelo usuário SMTP.'
        : 'Revise o servidor, a porta, o remetente e as credenciais.';
      throw new Error(message);
    }
    renderPlatformEmailSettings(payload.settings);
    setFormFeedback(platformEmailFeedback, 'Configuração SMTP salva. Envie um teste para validar a entrega.');
  } catch (error) {
    setFormFeedback(platformEmailFeedback, error instanceof Error ? error.message : 'Falha ao salvar a configuração.', true);
  } finally {
    setButtonLoading(savePlatformEmailButton, false);
  }
});

platformEmailTestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!platformEmailTestForm.reportValidity()) return;
  setFormFeedback(platformEmailTestFeedback, 'Enviando mensagem de teste…');
  const original = testPlatformEmailButton.textContent;
  testPlatformEmailButton.disabled = true;
  testPlatformEmailButton.textContent = 'Enviando…';
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/email-settings/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ recipient: platformEmailTestForm.elements.recipient.value.trim() })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'O servidor SMTP recusou a mensagem de teste.');
    setFormFeedback(platformEmailTestFeedback, 'Mensagem entregue. Verifique a caixa de entrada e o spam.');
    platformEmailLoaded = false;
    await loadPlatformEmailSettings();
  } catch (error) {
    setFormFeedback(platformEmailTestFeedback, error instanceof Error ? error.message : 'Falha no teste SMTP.', true);
    platformEmailLoaded = false;
    await loadPlatformEmailSettings();
  } finally {
    testPlatformEmailButton.textContent = original;
    testPlatformEmailButton.disabled = false;
  }
});

function updateClientPlanPreview() {
  const plan = availablePlans.find((candidate) => candidate.code === createClientForm.elements.planCode.value);
  const override = createClientForm.elements.deviceLimitOverride.value;
  clientWizardPlanName.textContent = plan?.name || 'Selecione um plano';
  clientWizardPlanDetail.textContent = override
    ? `Limite específico de ${formatNumber(Number(override))} equipamento(s).`
    : plan?.deviceLimit === null
      ? 'Sem limite de equipamentos definido pelo plano.'
      : plan
        ? `Até ${formatNumber(plan.deviceLimit)} equipamento(s), conforme o plano.`
        : 'O limite efetivo aparecerá aqui.';
}

function updateClientReview() {
  const plan = availablePlans.find((candidate) => candidate.code === createClientForm.elements.planCode.value);
  const override = createClientForm.elements.deviceLimitOverride.value;
  clientReviewName.textContent = createClientForm.elements.name.value.trim() || 'Não informado';
  clientReviewPlan.textContent = plan?.name || 'Não selecionado';
  clientReviewLimit.textContent = override
    ? `${formatNumber(Number(override))} equipamento(s)`
    : plan?.deviceLimit === null ? 'Sem limite' : plan ? `${formatNumber(plan.deviceLimit)} equipamento(s)` : 'Conforme plano';
  clientReviewAdmin.textContent = createClientForm.elements.adminName.value.trim()
    || createClientForm.elements.adminEmail.value.trim()
    || 'Não informado';
}

function setClientWizardStep(step) {
  clientWizardStep = Math.min(4, Math.max(1, step));
  clientWizardSteps.forEach((section) => {
    const selected = Number(section.dataset.clientStep) === clientWizardStep;
    section.hidden = !selected;
    section.classList.toggle('active', selected);
  });
  clientWizardIndicators.forEach((indicator) => {
    const indicatorStep = Number(indicator.dataset.clientStepIndicator);
    indicator.classList.toggle('active', indicatorStep === clientWizardStep);
    indicator.classList.toggle('completed', indicatorStep < clientWizardStep);
    if (indicatorStep === clientWizardStep) indicator.setAttribute('aria-current', 'step');
    else indicator.removeAttribute('aria-current');
  });
  clientWizardBackButton.hidden = clientWizardStep === 1;
  clientWizardNextButton.hidden = clientWizardStep === 4;
  createClientButton.hidden = clientWizardStep !== 4;
  setFormFeedback(createClientFeedback, '');
  if (clientWizardStep === 3) updateClientPlanPreview();
  if (clientWizardStep === 4) updateClientReview();
  document.querySelector('.client-wizard-body').scrollTop = 0;
  const firstField = clientWizardSteps.find((section) => Number(section.dataset.clientStep) === clientWizardStep)
    ?.querySelector('input:not([type="file"]), select');
  window.setTimeout(() => firstField?.focus(), 0);
}

function validateClientWizardStep() {
  const current = clientWizardSteps.find((section) => Number(section.dataset.clientStep) === clientWizardStep);
  const fields = [...current.querySelectorAll('input, select')];
  const invalid = fields.find((field) => !field.checkValidity());
  if (!invalid) return true;
  invalid.reportValidity();
  invalid.focus();
  return false;
}

function openClientWizard() {
  createClientForm.reset();
  createClientForm.elements.companyPostalCode.dispatchEvent(new Event('input'));
  setPostalCodeFeedback(document.querySelector('[data-cep-feedback="new-company"]'), 'Digite o CEP para preencher o endereço.');
  createClientForm.elements.adminPassword.type = 'password';
  generateClientPasswordButton.textContent = 'Gerar';
  newCompanyLogoLabel.textContent = 'Clique para selecionar PNG ou JPEG';
  newCompanyLogoLabel.closest('.client-logo-upload').classList.remove('has-file');
  populatePlanSelect(createClientForm.elements.planCode);
  syncCustomLimit(createClientForm.elements.planCode, createClientForm.elements.deviceLimitOverride);
  updateClientPlanPreview();
  setClientWizardStep(1);
  clientWizardDialog.showModal();
  window.setTimeout(() => createClientForm.elements.name.focus(), 0);
}

openClientWizardButton.addEventListener('click', openClientWizard);
closeClientWizardButton.addEventListener('click', () => clientWizardDialog.close());
clientWizardBackButton.addEventListener('click', () => setClientWizardStep(clientWizardStep - 1));
clientWizardNextButton.addEventListener('click', () => {
  if (validateClientWizardStep()) setClientWizardStep(clientWizardStep + 1);
});

createClientForm.elements.planCode.addEventListener('change', () => {
  syncCustomLimit(createClientForm.elements.planCode, createClientForm.elements.deviceLimitOverride);
  updateClientPlanPreview();
});
createClientForm.elements.deviceLimitOverride.addEventListener('input', updateClientPlanPreview);
createClientForm.elements.name.addEventListener('input', updateClientReview);
createClientForm.elements.adminName.addEventListener('input', updateClientReview);
createClientForm.elements.adminEmail.addEventListener('input', updateClientReview);
createClientForm.elements.companyLogo.addEventListener('change', () => {
  const file = createClientForm.elements.companyLogo.files?.[0];
  const invalid = file && (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 512 * 1024);
  createClientForm.elements.companyLogo.setCustomValidity(invalid ? 'Use uma imagem PNG ou JPEG de até 512 KB.' : '');
  if (invalid) createClientForm.elements.companyLogo.reportValidity();
  newCompanyLogoLabel.textContent = file ? file.name : 'Clique para selecionar PNG ou JPEG';
  newCompanyLogoLabel.closest('.client-logo-upload').classList.toggle('has-file', Boolean(file) && !invalid);
});

generateClientPasswordButton.addEventListener('click', () => {
  const passwordInput = createClientForm.elements.adminPassword;
  passwordInput.type = 'text';
  passwordInput.value = generateSecurePassword();
  generateClientPasswordButton.textContent = 'Gerar outra';
  passwordInput.focus();
  passwordInput.select();
});

companyLogoFile.addEventListener('change', async () => {
  try {
    companyLogoDataUrl = await readCompanyLogo(companyLogoFile.files?.[0]);
    removeCompanyLogo = false;
    renderCompanyLogo(companyLogoPreview, companyLogoDataUrl || '');
    setFormFeedback(companyProfileFeedback, 'Novo logotipo selecionado. Salve para confirmar.');
  } catch (error) {
    companyLogoFile.value = '';
    setFormFeedback(companyProfileFeedback, error instanceof Error ? error.message : 'Arquivo inválido.', true);
  }
});

removeCompanyLogoButton.addEventListener('click', () => {
  companyLogoDataUrl = null;
  removeCompanyLogo = true;
  companyLogoFile.value = '';
  renderCompanyLogo(companyLogoPreview);
  setFormFeedback(companyProfileFeedback, 'O logotipo será removido quando você salvar.');
});

companyProfileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!companyProfileForm.reportValidity()) return;
  setButtonLoading(saveCompanyProfileButton, true);
  setFormFeedback(companyProfileFeedback, '');
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/company-profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        ...companyPayloadFromForm(companyProfileForm),
        logoDataUrl: companyLogoDataUrl,
        removeLogo: removeCompanyLogo
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error === 'invalid_company_profile' ? 'Revise o CNPJ, CEP, e-mail e os demais campos.' : 'Não foi possível salvar os dados da empresa.');
    companyProfileLoaded = false;
    await loadCompanyProfile();
    setFormFeedback(companyProfileFeedback, 'Dados da empresa salvos. Os próximos relatórios usarão este cabeçalho.');
  } catch (error) {
    setFormFeedback(companyProfileFeedback, error instanceof Error ? error.message : 'Falha ao salvar cadastro.', true);
  } finally {
    setButtonLoading(saveCompanyProfileButton, false);
  }
});

platformCompanyLogoFile.addEventListener('change', async () => {
  try {
    platformCompanyLogoDataUrl = await readCompanyLogo(platformCompanyLogoFile.files?.[0]);
    removePlatformCompanyLogo = false;
    renderCompanyLogo(platformCompanyLogoPreview, platformCompanyLogoDataUrl || '');
    setFormFeedback(platformCompanyFeedback, 'Novo logotipo selecionado. Salve para confirmar.');
  } catch (error) {
    platformCompanyLogoFile.value = '';
    setFormFeedback(platformCompanyFeedback, error instanceof Error ? error.message : 'Arquivo inválido.', true);
  }
});

platformCompanyForm.elements.planCode.addEventListener('change', () => {
  syncCustomLimit(platformCompanyForm.elements.planCode, platformCompanyForm.elements.deviceLimitOverride);
});

generatePlatformUserPasswordButton.addEventListener('click', () => {
  const input = platformClientUserCreateForm.elements.password;
  input.type = 'text';
  input.value = generateSecurePassword();
  generatePlatformUserPasswordButton.textContent = 'Gerar outra';
  setFormFeedback(platformClientUserCreateFeedback, 'Senha forte gerada. Copie-a antes de adicionar o usuário.');
  input.focus();
  input.select();
});

platformClientUserCreateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!platformClientUserCreateForm.reportValidity()) return;
  const tenantId = platformClientUsersTenantId.value;
  const data = new FormData(platformClientUserCreateForm);
  setButtonLoading(createPlatformClientUserButton, true);
  setFormFeedback(platformClientUserCreateFeedback, '');
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/tenants/${tenantId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: String(data.get('name')).trim(),
        email: String(data.get('email')).trim(),
        role: String(data.get('role')),
        password: String(data.get('password'))
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        email_already_exists: 'Já existe uma conta ativa com este e-mail.',
        tenant_not_found: 'Este cliente não existe mais.',
        invalid_user: 'Revise o nome, o e-mail, o perfil e a senha.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível adicionar o usuário.');
    }
    const createdEmail = payload.user.email;
    platformClientUserCreateForm.reset();
    platformClientUserCreateForm.elements.password.type = 'password';
    generatePlatformUserPasswordButton.textContent = 'Gerar senha';
    setFormFeedback(platformClientUserCreateFeedback, `Usuário ${createdEmail} adicionado com sucesso.`);
    clientsLoaded = false;
    await loadPlatformClientUsers();
  } catch (error) {
    setFormFeedback(platformClientUserCreateFeedback, error instanceof Error ? error.message : 'Falha ao adicionar usuário.', true);
  } finally {
    setButtonLoading(createPlatformClientUserButton, false);
  }
});

generatePlatformUserNewPasswordButton.addEventListener('click', () => {
  platformUserNewPassword.type = 'text';
  platformUserNewPassword.value = generateSecurePassword();
  generatePlatformUserNewPasswordButton.textContent = 'Gerar outra';
  setFormFeedback(platformUserPasswordFeedback, 'Senha forte gerada. Copie-a antes de confirmar.');
  platformUserNewPassword.focus();
  platformUserNewPassword.select();
});

platformUserPasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!platformUserPasswordForm.reportValidity()) return;
  const tenantId = platformClientUsersTenantId.value;
  const userId = platformUserPasswordForm.elements.userId.value;
  const email = platformUserPasswordForm.dataset.userEmail || 'o usuário selecionado';
  const scope = platformUserPasswordForm.dataset.scope;
  if (!window.confirm(`Redefinir a senha de ${email}? As sessões atuais dessa conta serão encerradas.`)) return;
  setButtonLoading(resetPlatformUserPasswordButton, true);
  setFormFeedback(platformUserPasswordFeedback, '');
  try {
    const endpoint = scope === 'platform'
      ? `${API_BASE}/v1/platform/tenants/${tenantId}/users/${userId}/reset-password`
      : `${API_BASE}/v1/users/${userId}/reset-password`;
    const response = await authenticatedFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ password: platformUserNewPassword.value })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        user_not_found: 'Este usuário não existe mais.',
        invalid_password_reset: 'Informe uma senha com pelo menos 12 caracteres.',
        platform_owner_protected: 'A conta do Administrador principal é protegida.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível redefinir a senha.');
    }
    platformUserPasswordDialog.close();
    if (userId === currentUser?.id) {
      showLogin('Senha redefinida. Entre novamente com a nova senha.', 'success');
    } else {
      window.alert(`Senha de ${email} redefinida. As sessões anteriores foram encerradas.`);
      if (scope !== 'platform') {
        usersLoaded = false;
        void loadUsers();
      }
    }
  } catch (error) {
    setFormFeedback(platformUserPasswordFeedback, error instanceof Error ? error.message : 'Falha ao redefinir senha.', true);
  } finally {
    setButtonLoading(resetPlatformUserPasswordButton, false);
  }
});

refreshPlatformClientUsersButton.addEventListener('click', () => void loadPlatformClientUsers());
closePlatformClientUsersButton.addEventListener('click', () => platformClientUsersDialog.close());
finishPlatformClientUsersButton.addEventListener('click', () => platformClientUsersDialog.close());
closePlatformUserPasswordButton.addEventListener('click', () => platformUserPasswordDialog.close());
platformClientUsersDialog.addEventListener('close', () => {
  platformClientUsersTenantId.value = '';
  if (isPlatformContext() && !clientsLoaded) void loadClients();
});

removePlatformCompanyLogoButton.addEventListener('click', () => {
  platformCompanyLogoDataUrl = null;
  removePlatformCompanyLogo = true;
  platformCompanyLogoFile.value = '';
  renderCompanyLogo(platformCompanyLogoPreview);
  setFormFeedback(platformCompanyFeedback, 'O logotipo será removido quando você salvar.');
});

closePlatformCompanyDialogButton.addEventListener('click', () => platformCompanyDialog.close());
cancelPlatformCompanyButton.addEventListener('click', () => platformCompanyDialog.close());
platformCompanyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!platformCompanyForm.reportValidity()) return;
  setButtonLoading(savePlatformCompanyButton, true);
  setFormFeedback(platformCompanyFeedback, '');
  const tenantId = platformCompanyForm.elements.tenantId.value;
  let generalDataSaved = false;
  try {
    const limitValue = platformCompanyForm.elements.deviceLimitOverride.value;
    const tenantResponse = await authenticatedFetch(`${API_BASE}/v1/platform/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: platformCompanyForm.elements.name.value.trim(),
        timezone: platformCompanyForm.elements.timezone.value,
        active: platformCompanyForm.elements.active.checked,
        planCode: platformCompanyForm.elements.planCode.value,
        deviceLimitOverride: limitValue === '' ? null : Number(limitValue)
      })
    });
    const tenantPayload = await tenantResponse.json().catch(() => ({}));
    if (!tenantResponse.ok) {
      const messages = {
        cannot_deactivate_own_tenant: 'O ambiente da sua própria conta deve permanecer ativo.',
        limit_below_usage: `O cliente possui ${formatNumber(tenantPayload.devicesUsed)} equipamento(s). O limite não pode ser menor que o uso atual.`,
        tenant_not_found: 'Este cliente não existe mais.',
        plan_not_found: 'O plano selecionado não está mais disponível.',
        invalid_tenant_update: 'Revise o nome, o fuso horário, o plano e o limite específico.'
      };
      throw new Error(messages[tenantPayload.error] || 'Não foi possível salvar os dados gerais do cliente.');
    }
    generalDataSaved = true;

    const companyResponse = await authenticatedFetch(`${API_BASE}/v1/platform/tenants/${tenantId}/company-profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        ...companyPayloadFromForm(platformCompanyForm),
        logoDataUrl: platformCompanyLogoDataUrl,
        removeLogo: removePlatformCompanyLogo
      })
    });
    const companyPayload = await companyResponse.json().catch(() => ({}));
    if (!companyResponse.ok) {
      throw new Error(companyPayload.error === 'invalid_company_profile'
        ? 'Os dados gerais foram salvos, mas revise o CNPJ, CEP, e-mail e os demais dados da empresa.'
        : 'Os dados gerais foram salvos, mas não foi possível salvar os dados institucionais.');
    }
    clientsLoaded = false;
    devicesLoaded = false;
    await loadClients();
    platformCompanyDialog.close();
  } catch (error) {
    setFormFeedback(platformCompanyFeedback, error instanceof Error ? error.message : 'Falha ao salvar cadastro.', true);
    if (generalDataSaved) {
      clientsLoaded = false;
      void loadClients();
    }
  } finally {
    setButtonLoading(savePlatformCompanyButton, false);
  }
});

createClientForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (clientWizardStep < 4) {
    if (validateClientWizardStep()) setClientWizardStep(clientWizardStep + 1);
    return;
  }
  if (!createClientForm.reportValidity()) return;
  setFormFeedback(createClientFeedback, '');
  setButtonLoading(createClientButton, true);
  const data = new FormData(createClientForm);
  const planCode = String(data.get('planCode'));
  const limitValue = String(data.get('deviceLimitOverride') || '');
  try {
    const logoFile = data.get('companyLogo');
    const logoDataUrl = logoFile instanceof File && logoFile.size ? await readCompanyLogo(logoFile) : null;
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: String(data.get('name')).trim(),
        timezone: 'America/Sao_Paulo',
        planCode,
        deviceLimitOverride: limitValue ? Number(limitValue) : null,
        adminName: String(data.get('adminName')).trim(),
        adminEmail: String(data.get('adminEmail')).trim(),
        adminPassword: String(data.get('adminPassword')),
        companyProfile: {
          legalName: String(data.get('companyLegalName') || '').trim(),
          tradeName: String(data.get('companyTradeName') || '').trim(),
          cnpj: String(data.get('companyCnpj') || '').trim(),
          phone: String(data.get('companyPhone') || '').trim(),
          email: String(data.get('companyEmail') || '').trim(),
          postalCode: String(data.get('companyPostalCode') || '').trim(),
          street: String(data.get('companyStreet') || '').trim(),
          addressNumber: String(data.get('companyAddressNumber') || '').trim(),
          complement: String(data.get('companyComplement') || '').trim(),
          district: String(data.get('companyDistrict') || '').trim(),
          city: String(data.get('companyCity') || '').trim(),
          state: String(data.get('companyState') || '').trim(),
          logoDataUrl,
          removeLogo: false
        }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error === 'email_already_exists'
        ? 'Este e-mail já identifica outra conta ativa.'
        : payload.error === 'invalid_tenant'
          ? 'Revise o CNPJ, CEP, e-mails e os demais campos informados.'
          : 'Revise os dados, o plano e a senha inicial do cliente.';
      throw new Error(message);
    }
    const createdName = String(data.get('name')).trim();
    createClientForm.reset();
    createClientForm.elements.adminPassword.type = 'password';
    generateClientPasswordButton.textContent = 'Gerar';
    newCompanyLogoLabel.textContent = 'Clique para selecionar PNG ou JPEG';
    newCompanyLogoLabel.closest('.client-logo-upload').classList.remove('has-file');
    populatePlanSelect(createClientForm.elements.planCode);
    syncCustomLimit(createClientForm.elements.planCode, createClientForm.elements.deviceLimitOverride);
    setFormFeedback(createClientFeedback, `${createdName} criado. O administrador já pode entrar com o e-mail e a senha informados.`);
    clientsLoaded = false;
    await loadClients();
    window.setTimeout(() => {
      if (clientWizardDialog.open) clientWizardDialog.close();
    }, 650);
  } catch (error) {
    setFormFeedback(createClientFeedback, error instanceof Error ? error.message : 'Falha ao criar cliente.', true);
  } finally {
    setButtonLoading(createClientButton, false);
  }
});

createPlanForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!createPlanForm.reportValidity()) return;
  setFormFeedback(createPlanFeedback, '');
  setButtonLoading(createPlanButton, true);
  const data = new FormData(createPlanForm);
  const limitValue = String(data.get('deviceLimit') || '');
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: String(data.get('name')).trim(),
        deviceLimit: limitValue === '' ? null : Number(limitValue)
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error === 'plan_name_already_exists'
        ? 'Já existe um plano ativo com este nome.'
        : 'Revise o nome e o limite do plano.');
    }
    createPlanForm.reset();
    setFormFeedback(createPlanFeedback, `${payload.plan.name} criado e disponível para novos clientes.`);
    clientsLoaded = false;
    plansLoaded = false;
    await loadPlans();
  } catch (error) {
    setFormFeedback(createPlanFeedback, error instanceof Error ? error.message : 'Falha ao criar plano.', true);
  } finally {
    setButtonLoading(createPlanButton, false);
  }
});

closeDeleteClientDialog.addEventListener('click', () => deleteClientDialog.close());

deleteClientForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!deleteClientForm.reportValidity()) return;
  if (deleteClientForm.elements.confirmation.value !== deleteClientForm.dataset.tenantName) {
    setFormFeedback(deleteClientFeedback, 'O nome digitado não corresponde exatamente ao cliente.', true);
    return;
  }
  setFormFeedback(deleteClientFeedback, '');
  setButtonLoading(deleteClientSubmit, true);
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/tenants/${deleteClientForm.elements.tenantId.value}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        confirmation: deleteClientForm.elements.confirmation.value,
        acknowledgeBackupRetention: deleteClientForm.elements.acknowledgeBackupRetention.checked
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        cannot_delete_own_tenant: 'O tenant da sua própria conta não pode ser excluído.',
        tenant_confirmation_mismatch: 'O nome digitado não corresponde ao cliente.',
        tenant_not_found: 'Este cliente não existe mais.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível iniciar a exclusão.');
    }
    deleteClientDialog.close();
    clientsLoaded = false;
    await loadClients();
  } catch (error) {
    setFormFeedback(deleteClientFeedback, error instanceof Error ? error.message : 'Falha ao excluir cliente.', true);
  } finally {
    setButtonLoading(deleteClientSubmit, false);
  }
});

platformAuditTenant.addEventListener('change', () => void loadPlatformAudit());
platformAuditAction.addEventListener('change', () => void loadPlatformAudit());
refreshPlatformAuditButton.addEventListener('click', () => {
  auditLoaded = false;
  void loadPlatformAudit();
});

exportPlatformAuditButton.addEventListener('click', async () => {
  exportPlatformAuditButton.disabled = true;
  const original = exportPlatformAuditButton.textContent;
  exportPlatformAuditButton.textContent = 'Preparando…';
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/audit/export?${platformAuditQuery().toString()}`);
    if (!response.ok) throw new Error('Não foi possível exportar a auditoria da plataforma.');
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = match?.[1] || 'auditoria-plataforma.csv';
    document.body.append(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
    void loadPlatformAudit();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao exportar auditoria.');
  } finally {
    exportPlatformAuditButton.textContent = original;
    exportPlatformAuditButton.disabled = false;
  }
});

function roleLabel(role) {
  return { admin: 'Administrador', operator: 'Operador', auditor: 'Auditor' }[role] || role;
}

const platformPermissionDefinitions = [
  { key: 'dashboard', label: 'Dashboard', description: 'Indicadores gerais e atividade da plataforma.', group: 'Visão geral' },
  { key: 'devices', label: 'Equipamentos', description: 'Exportadores cadastrados em todos os clientes.', group: 'Operação CGNAT' },
  { key: 'collectors', label: 'Coletores', description: 'Coletores Cloud e Edge e suas filas.', group: 'Operação CGNAT' },
  { key: 'system', label: 'Sistema', description: 'Serviços locais e backups.', group: 'Infraestrutura' },
  { key: 'servers', label: 'Servidores', description: 'Saúde e histórico dos recursos.', group: 'Infraestrutura' },
  { key: 'continuity', label: 'Continuidade', description: 'Replicação e prontidão do datacenter standby.', group: 'Infraestrutura' },
  { key: 'firewall', label: 'Firewall', description: 'Origens autorizadas e políticas de entrada.', group: 'Infraestrutura' },
  { key: 'alerts', label: 'Alertas', description: 'Ocorrências e canais de notificação.', group: 'Infraestrutura' },
  { key: 'capacity', label: 'Capacidade', description: 'Consumo e projeções de armazenamento.', group: 'Infraestrutura' },
  { key: 'clients', label: 'Clientes', description: 'Empresas, ambientes e acesso administrativo.', group: 'Plataforma' },
  { key: 'plans', label: 'Planos', description: 'Catálogo e limites comerciais.', group: 'Plataforma' },
  { key: 'integrations', label: 'Integrações', description: 'Disponibilidade dos conectores ERP para os clientes.', group: 'Plataforma' },
  { key: 'users', label: 'Usuários', description: 'Contas e perfis de acesso da plataforma.', group: 'Plataforma' },
  { key: 'settings', label: 'Configurações', description: 'SMTP e parâmetros globais.', group: 'Plataforma' },
  { key: 'audit', label: 'Auditoria', description: 'Histórico das ações administrativas.', group: 'Plataforma' }
];

function accessProfilePermissionCounts(profile) {
  const levels = Object.values(profile.permissions || {});
  return {
    manage: levels.filter((level) => level === 'manage').length,
    view: levels.filter((level) => level === 'view').length,
    none: levels.filter((level) => level === 'none').length
  };
}

function populateAccessProfileSelect(select, selectedId = '') {
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = availableAccessProfiles.length ? 'Selecione um perfil' : 'Nenhum perfil disponível';
  select.append(placeholder);
  for (const profile of availableAccessProfiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === selectedId;
    select.append(option);
  }
}

function renderAccessProfileMatrix(permissions = {}) {
  accessProfileMatrix.replaceChildren();
  let currentGroup = '';
  for (const definition of platformPermissionDefinitions) {
    if (definition.group !== currentGroup) {
      currentGroup = definition.group;
      const group = document.createElement('p');
      group.className = 'access-profile-matrix-group';
      group.textContent = currentGroup;
      accessProfileMatrix.append(group);
    }
    const row = document.createElement('div');
    row.className = 'access-profile-permission-row';
    const copy = document.createElement('div');
    copy.innerHTML = `<strong>${definition.label}</strong><span>${definition.description}</span>`;
    const options = document.createElement('div');
    options.className = 'access-profile-level-options';
    const selected = permissions[definition.key] || 'none';
    for (const [value, label] of [['none', 'Sem acesso'], ['view', 'Visualizar'], ['manage', 'Gerenciar']]) {
      const option = document.createElement('label');
      option.className = value;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `permission-${definition.key}`;
      input.value = value;
      input.checked = value === selected;
      option.append(input, document.createTextNode(label));
      options.append(option);
    }
    row.append(copy, options);
    accessProfileMatrix.append(row);
  }
}

function openAccessProfileDialog(profile = null) {
  accessProfileForm.reset();
  accessProfileForm.elements.profileId.value = profile?.id || '';
  accessProfileForm.elements.name.value = profile?.name || '';
  accessProfileForm.elements.description.value = profile?.description || '';
  accessProfileDialogTitle.textContent = profile ? `Editar ${profile.name}` : 'Adicionar perfil';
  renderAccessProfileMatrix(profile?.permissions || {});
  setFormFeedback(accessProfileFeedback, '');
  accessProfileDialog.showModal();
  window.setTimeout(() => accessProfileForm.elements.name.focus(), 0);
}

function renderAccessProfiles(profiles) {
  accessProfileList.replaceChildren();
  const canManage = hasPlatformPermission('users', 'manage');
  for (const profile of profiles) {
    const counts = accessProfilePermissionCounts(profile);
    const card = document.createElement('article');
    card.className = 'access-profile-card';
    const icon = document.createElement('span');
    icon.className = 'access-profile-card-icon';
    icon.innerHTML = '<svg aria-hidden="true"><use href="#icon-shield"/></svg>';
    const copy = document.createElement('div');
    copy.className = 'access-profile-card-copy';
    const heading = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = profile.name;
    heading.append(name);
    if (profile.protected) {
      const system = document.createElement('em');
      system.textContent = 'PADRÃO';
      heading.append(system);
    }
    const description = document.createElement('span');
    description.textContent = profile.description || 'Sem descrição.';
    const stats = document.createElement('p');
    stats.innerHTML = `<b>${formatNumber(profile.assignedUsers)}</b> usuário(s) <i></i> <b>${formatNumber(counts.manage)}</b> gerenciar <i></i> <b>${formatNumber(counts.view)}</b> somente visualizar`;
    copy.append(heading, description, stats);
    card.append(icon, copy);
    if (canManage && !profile.protected) {
      const actions = document.createElement('div');
      actions.className = 'access-profile-card-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'table-action';
      edit.textContent = 'Editar';
      edit.disabled = !currentUser?.platformOwner && currentUser?.accessProfile?.id === profile.id;
      edit.title = edit.disabled ? 'Seu próprio perfil deve ser alterado por outro administrador' : '';
      edit.addEventListener('click', () => openAccessProfileDialog(profile));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'table-action danger';
      remove.textContent = 'Excluir';
      remove.disabled = profile.assignedUsers > 0;
      remove.title = remove.disabled ? 'Reatribua os usuários antes de excluir este perfil' : '';
      remove.addEventListener('click', () => void deleteAccessProfile(profile, remove));
      actions.append(edit, remove);
      card.append(actions);
    }
    accessProfileList.append(card);
  }
}

async function deleteAccessProfile(profile, button) {
  if (!window.confirm(`Excluir o perfil ${profile.name}?`)) return;
  button.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/access-profiles/${profile.id}`, {
      method: 'DELETE', headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        access_profile_in_use: 'Este perfil ainda está atribuído a um ou mais usuários.',
        protected_access_profile: 'O perfil padrão da plataforma não pode ser excluído.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível excluir o perfil.');
    }
    usersLoaded = false;
    await loadUsers();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao excluir perfil.');
    button.disabled = false;
  }
}

function setFormFeedback(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle('error', error);
  element.hidden = !message;
}

function roleSelect(selectedRole) {
  const select = document.createElement('select');
  for (const role of ['admin', 'operator', 'auditor']) {
    if (isPlatformContext() && role !== 'admin') continue;
    const option = document.createElement('option');
    option.value = role;
    option.textContent = roleLabel(role);
    option.selected = role === selectedRole;
    select.append(option);
  }
  select.disabled = isPlatformContext();
  return select;
}

async function updateManagedUser(user, row, active) {
  const name = row.querySelector('[data-user-name]').value.trim();
  const role = row.querySelector('[data-user-role]')?.value || user.role;
  const accessProfileId = row.querySelector('[data-user-access-profile]')?.value;
  const buttons = [...row.querySelectorAll('button')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, role, active, ...(accessProfileId ? { accessProfileId } : {}) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        cannot_remove_own_admin_access: 'Você não pode remover seu próprio acesso administrativo.',
        last_active_admin: 'É necessário manter pelo menos um administrador ativo.',
        invalid_user_update: 'Revise o nome e o perfil informados.',
        cannot_change_own_access_profile: 'Seu próprio perfil deve ser alterado por outro administrador.',
        platform_owner_protected: 'A conta do Administrador principal é protegida.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível atualizar o usuário.');
    }
    usersLoaded = false;
    await loadUsers();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao atualizar usuário.');
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function deleteManagedUser(user, row) {
  const confirmed = window.confirm(`Excluir ${user.name}? O acesso será revogado imediatamente, mas consultas, exportações e auditoria histórica serão preservadas.`);
  if (!confirmed) return;
  const buttons = [...row.querySelectorAll('button')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/users/${user.id}`, {
      method: 'DELETE', headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        cannot_delete_own_user: 'Você não pode excluir sua própria conta.',
        last_active_admin: 'É necessário manter pelo menos um administrador ativo.',
        user_not_found: 'Este usuário já foi excluído.',
        platform_owner_protected: 'A conta do Administrador principal é protegida.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível excluir o usuário.');
    }
    usersLoaded = false;
    auditLoaded = false;
    await loadUsers();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao excluir usuário.');
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function renderUsers(users) {
  usersBody.replaceChildren();
  const platformScope = isPlatformContext();
  const canManage = !platformScope || hasPlatformPermission('users', 'manage');
  for (const user of users) {
    const canEditUser = canManage && (!user.platformOwner || user.id === currentUser?.id);
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.dataset.label = 'Nome';
    const nameInput = document.createElement('input');
    nameInput.value = user.name;
    nameInput.dataset.userName = '';
    nameInput.maxLength = 200;
    nameInput.disabled = !canEditUser;
    nameCell.append(nameInput);

    const emailCell = td(user.email, 'E-mail');
    const roleCell = document.createElement('td');
    roleCell.dataset.label = 'Perfil';
    if (platformScope) {
      if (user.platformOwner) {
        const owner = document.createElement('span');
        owner.className = 'access-profile-user-badge owner';
        owner.textContent = 'Administrador principal';
        roleCell.append(owner);
      } else {
        const select = document.createElement('select');
        populateAccessProfileSelect(select, user.accessProfileId || '');
        select.dataset.userAccessProfile = '';
        select.required = true;
        select.disabled = !canManage || user.id === currentUser?.id;
        roleCell.append(select);
      }
    } else {
      const select = roleSelect(user.role);
      select.dataset.userRole = '';
      roleCell.append(select);
    }

    const statusCell = document.createElement('td');
    statusCell.dataset.label = 'Estado';
    const status = document.createElement('span');
    status.className = `user-status ${user.active ? 'active' : 'inactive'}`;
    status.textContent = user.active ? 'Ativo' : 'Inativo';
    statusCell.append(status);

    const lastLogin = td(user.lastLoginAt ? formatDeviceMoment(user.lastLoginAt) : 'Nunca acessou', 'Último acesso');
    const actionsCell = document.createElement('td');
    actionsCell.dataset.label = 'Ações';
    const actions = document.createElement('div');
    actions.className = 'user-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'table-action';
    save.textContent = 'Salvar';
    save.addEventListener('click', () => void updateManagedUser(user, row, user.active));
    const resetPassword = document.createElement('button');
    resetPassword.type = 'button';
    resetPassword.className = 'table-action';
    resetPassword.textContent = 'Redefinir senha';
    resetPassword.addEventListener('click', () => openUserPasswordDialog(user, 'tenant'));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `table-action ${user.active ? 'deactivate' : 'activate'}`;
    toggle.textContent = user.active ? 'Desativar' : 'Ativar';
    toggle.disabled = user.id === currentUser?.id;
    toggle.title = toggle.disabled ? 'Sua própria conta deve permanecer ativa' : '';
    toggle.addEventListener('click', () => void updateManagedUser(user, row, !user.active));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'table-action danger';
    remove.textContent = 'Excluir';
    remove.disabled = user.id === currentUser?.id;
    remove.title = remove.disabled ? 'Você não pode excluir sua própria conta' : 'Excluir usuário preservando a auditoria';
    remove.addEventListener('click', () => void deleteManagedUser(user, row));
    if (canEditUser) actions.append(save, resetPassword, toggle, remove);
    else {
      const readOnly = document.createElement('span');
      readOnly.className = 'access-profile-read-only';
      readOnly.textContent = user.platformOwner ? 'Conta protegida' : 'Somente visualização';
      actions.append(readOnly);
    }
    actionsCell.append(actions);
    row.append(nameCell, emailCell, roleCell, statusCell, lastLogin, actionsCell);
    usersBody.append(row);
  }
}

async function loadUsers() {
  usersLoading.hidden = false;
  usersError.hidden = true;
  usersTableWrap.hidden = true;
  refreshUsersButton.disabled = true;
  if (isPlatformContext()) {
    accessProfilesLoading.hidden = false;
    accessProfileList.hidden = true;
  }
  try {
    const [response, profilesResponse] = await Promise.all([
      authenticatedFetch(`${API_BASE}/v1/users`, { headers: { Accept: 'application/json' }, cache: 'no-store' }),
      isPlatformContext()
        ? authenticatedFetch(`${API_BASE}/v1/platform/access-profiles`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
        : Promise.resolve(null)
    ]);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 403 ? 'Somente administradores podem gerenciar usuários.' : 'O serviço de usuários não respondeu corretamente.');
    if (profilesResponse) {
      const profilesPayload = await profilesResponse.json().catch(() => ({}));
      if (!profilesResponse.ok) throw new Error('Não foi possível carregar os perfis de acesso.');
      availableAccessProfiles = profilesPayload.profiles || [];
      populateAccessProfileSelect(newUserAccessProfile, newUserAccessProfile.value);
      renderAccessProfiles(availableAccessProfiles);
      accessProfilesLoading.hidden = true;
      accessProfileList.hidden = false;
    }
    userTotal.textContent = formatNumber(payload.users.length);
    userActive.textContent = formatNumber(payload.users.filter((user) => user.active).length);
    userAdmins.textContent = formatNumber(isPlatformContext()
      ? availableAccessProfiles.length
      : payload.users.filter((user) => user.active && user.role === 'admin').length);
    usersGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(new Date().toISOString())}`;
    renderUsers(payload.users);
    usersLoaded = true;
    usersLoading.hidden = true;
    usersTableWrap.hidden = false;
  } catch (error) {
    usersLoading.hidden = true;
    if (!appShell.hidden) {
      usersError.hidden = false;
      usersErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshUsersButton.disabled = false;
  }
}

createUserForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!createUserForm.reportValidity()) return;
  setFormFeedback(createUserFeedback, '');
  setButtonLoading(createUserButton, true);
  const data = new FormData(createUserForm);
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: String(data.get('name')).trim(),
        email: String(data.get('email')).trim(),
        role: isPlatformContext() ? 'admin' : String(data.get('role')),
        password: String(data.get('password')),
        ...(isPlatformContext() ? { accessProfileId: String(data.get('accessProfileId')) } : {})
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error === 'email_already_exists' ? 'Já existe uma conta com este e-mail.' : 'Revise os dados do novo usuário.');
    }
    createUserForm.reset();
    setFormFeedback(createUserFeedback, `Usuário ${payload.user.email} criado com sucesso.`);
    usersLoaded = false;
    await loadUsers();
  } catch (error) {
    setFormFeedback(createUserFeedback, error instanceof Error ? error.message : 'Falha ao criar usuário.', true);
  } finally {
    setButtonLoading(createUserButton, false);
  }
});

addAccessProfileButton.addEventListener('click', () => openAccessProfileDialog());
closeAccessProfileDialogButton.addEventListener('click', () => accessProfileDialog.close());
cancelAccessProfileButton.addEventListener('click', () => accessProfileDialog.close());
setFullAccessProfileButton.addEventListener('click', () => {
  accessProfileMatrix.querySelectorAll('input[value="manage"]').forEach((input) => { input.checked = true; });
});

accessProfileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!accessProfileForm.reportValidity()) return;
  const profileId = accessProfileForm.elements.profileId.value;
  const permissions = Object.fromEntries(platformPermissionDefinitions.map((definition) => [
    definition.key,
    accessProfileForm.elements[`permission-${definition.key}`].value
  ]));
  setFormFeedback(accessProfileFeedback, '');
  setButtonLoading(saveAccessProfileButton, true);
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/platform/access-profiles${profileId ? `/${profileId}` : ''}`, {
      method: profileId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: accessProfileForm.elements.name.value.trim(),
        description: accessProfileForm.elements.description.value.trim(),
        permissions
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        access_profile_name_exists: 'Já existe um perfil com este nome.',
        access_profile_not_found: 'Este perfil não está mais disponível.',
        cannot_change_own_access_profile: 'Seu próprio perfil deve ser alterado por outro administrador.',
        invalid_access_profile: 'Revise o nome e as permissões selecionadas.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível salvar o perfil.');
    }
    accessProfileDialog.close();
    usersLoaded = false;
    await loadUsers();
  } catch (error) {
    setFormFeedback(accessProfileFeedback, error instanceof Error ? error.message : 'Falha ao salvar perfil.', true);
  } finally {
    setButtonLoading(saveAccessProfileButton, false);
  }
});

changePasswordButton.addEventListener('click', () => {
  changePasswordForm.reset();
  setFormFeedback(passwordFeedback, '');
  passwordDialog.showModal();
  window.setTimeout(() => changePasswordForm.currentPassword.focus(), 0);
});

closePasswordDialog.addEventListener('click', () => passwordDialog.close());

changePasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!changePasswordForm.reportValidity()) return;
  const currentPassword = changePasswordForm.currentPassword.value;
  const newPassword = changePasswordForm.newPassword.value;
  if (newPassword !== changePasswordForm.confirmPassword.value) {
    setFormFeedback(passwordFeedback, 'A confirmação não corresponde à nova senha.', true);
    return;
  }
  setFormFeedback(passwordFeedback, '');
  setButtonLoading(changePasswordSubmit, true);
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error === 'current_password_invalid'
        ? 'A senha atual está incorreta.'
        : 'A nova senha deve ter pelo menos 12 caracteres e ser diferente da atual.';
      throw new Error(message);
    }
    passwordDialog.close();
    showLogin('Senha alterada. Entre novamente com a nova senha.', 'success');
  } catch (error) {
    if (!appShell.hidden) setFormFeedback(passwordFeedback, error instanceof Error ? error.message : 'Falha ao alterar senha.', true);
  } finally {
    setButtonLoading(changePasswordSubmit, false);
  }
});

function auditCategoryLabel(category) {
  return { search: 'Consulta', export: 'Exportação', auth: 'Autenticação', users: 'Usuários', devices: 'Equipamentos', collectors: 'Coletores', firewall: 'Firewall', backups: 'Backups' }[category] || category;
}

function auditActionLabel(event) {
  if (event.category === 'devices') {
    return { created: 'Equipamento criado', updated: 'Equipamento atualizado', enabled: 'Equipamento ativado', disabled: 'Equipamento desativado', deleted: 'Equipamento excluído' }[event.action] || event.action;
  }
  if (event.category === 'collectors') {
    return { created: 'Coletor criado', updated: 'Coletor atualizado', activated: 'Coletor ativado', deactivated: 'Coletor desativado', credential_rotated: 'Chave rotacionada', deleted: 'Coletor excluído' }[event.action] || event.action;
  }
  if (event.category === 'firewall') {
    return {
      policy_monitor_enabled: 'Monitoramento ativado',
      policy_enforcement_enabled: 'Proteção ativada',
      source_authorized: 'Origem autorizada',
      source_authorization_removed: 'Autorização removida'
    }[event.action] || event.action;
  }
  if (event.category === 'backups') return event.action === 'download_started' ? 'Download de backup iniciado' : event.action;
  const labels = {
    searched: 'Consultou CGNAT', csv: 'Exportou CSV', pdf: 'Exportou PDF', official_pdf: 'Gerou relatório para ofício',
    login_success: 'Login realizado', login_failure: 'Falha no login', logout: 'Logout realizado',
    password_change: 'Senha alterada', password_reset_requested: 'Recuperação de senha solicitada',
    password_reset_completed: 'Senha recuperada', created: 'Usuário criado', updated: 'Usuário atualizado',
    activated: 'Usuário ativado', deactivated: 'Usuário desativado', deleted: 'Usuário excluído'
  };
  return labels[event.action] || event.action;
}

function auditDetail(event) {
  const details = event.details || {};
  if (event.category === 'search') {
    const port = details.port ? `porta ${details.port}` : 'sem porta';
    const protocol = details.protocol ? protocolLabel({ protocol: details.protocol }) : 'todos os protocolos';
    const duration = details.durationMs !== null && details.durationMs !== undefined && Number.isFinite(Number(details.durationMs))
      ? ` · ${formatNumber(Number(details.durationMs))} ms`
      : '';
    return `${details.publicIp} · ${formatDeviceMoment(details.searchedAt)} · ${port} · ${protocol} · ${details.resultCount} resultado(s)${duration}`;
  }
  if (event.category === 'export') {
    const port = details.port ? `porta ${details.port}` : 'sem porta';
    const format = details.format === 'official_pdf' ? 'Relatório para ofício' : String(details.format || '').toUpperCase();
    return `${format} · ${details.publicIp} · ${port} · hash ${String(details.sha256 || '').slice(0, 16)}…`;
  }
  if (event.category === 'auth') {
    return `IP ${details.ipAddress || 'não informado'}${details.userAgent ? ` · ${String(details.userAgent).slice(0, 90)}` : ''}`;
  }
  if (event.category === 'devices') {
    return `${details.deviceName || details.name || 'Equipamento'} · ${details.exporterIp || ''} · ${String(details.vendor || '').toUpperCase()}`;
  }
  if (event.category === 'collectors') {
    return `${details.collectorName || details.name || 'Coletor'}${details.mode ? ` · ${String(details.mode).toUpperCase()}` : ''}`;
  }
  if (event.category === 'firewall') {
    const source = details.sourceCidr ? ` · ${details.sourceCidr}` : '';
    const mode = details.mode ? ` · ${details.mode === 'enforce' ? 'Proteção ativa' : 'Monitoramento'}` : '';
    return `${details.collectorName || 'Coletor'}${source}${mode}`;
  }
  if (event.category === 'backups') {
    return `${details.backupId || 'Backup'} · ${formatBytes(Number(details.totalBytes || 0))} · IP ${details.ipAddress || 'não informado'}`;
  }
  return `${details.targetName || 'Usuário'} · ${details.targetEmail || ''}${details.role ? ` · ${roleLabel(details.role)}` : ''}`;
}

function renderAudit(events) {
  auditBody.replaceChildren();
  for (const event of events) {
    const row = document.createElement('tr');
    const categoryCell = document.createElement('td');
    categoryCell.dataset.label = 'Categoria';
    const category = document.createElement('span');
    category.className = `audit-category ${event.category}`;
    category.textContent = auditCategoryLabel(event.category);
    categoryCell.append(category);
    const actionCell = td(auditActionLabel(event), 'Ação', 'audit-action');
    const detailCell = td(auditDetail(event), 'Detalhes', 'audit-details');
    const idCell = td(event.id, 'ID', 'audit-id');
    idCell.title = event.id;
    row.append(
      td(formatDeviceMoment(event.createdAt), 'Data e horário'),
      categoryCell,
      td(event.actorName ? `${event.actorName} · ${event.actorEmail}` : event.actorEmail, 'Usuário'),
      actionCell,
      detailCell,
      idCell
    );
    auditBody.append(row);
  }
}

async function loadAudit() {
  auditLoading.hidden = false;
  auditError.hidden = true;
  auditTableWrap.hidden = true;
  refreshAuditButton.disabled = true;
  auditCategory.disabled = true;
  try {
    const query = new URLSearchParams({ category: auditCategory.value, limit: '100' });
    const response = await authenticatedFetch(`${API_BASE}/v1/audit/events?${query.toString()}`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 403 ? 'Seu perfil não possui acesso à auditoria.' : 'O serviço de auditoria não respondeu corretamente.');
    auditSearches.textContent = formatNumber(payload.summary.searches24h);
    auditExports.textContent = formatNumber(payload.summary.exports24h);
    auditLoginFailures.textContent = formatNumber(payload.summary.loginFailures24h);
    auditUserChanges.textContent = formatNumber(payload.summary.userChanges24h + payload.summary.deviceChanges24h + payload.summary.collectorChanges24h);
    auditGeneratedAt.textContent = `Atualizado em ${formatDeviceMoment(new Date().toISOString())} · ${payload.events.length} evento(s)`;
    renderAudit(payload.events);
    auditLoaded = true;
    auditLoading.hidden = true;
    auditTableWrap.hidden = false;
  } catch (error) {
    auditLoading.hidden = true;
    if (!appShell.hidden) {
      auditError.hidden = false;
      auditErrorMessage.textContent = error instanceof Error ? error.message : 'Falha inesperada.';
    }
  } finally {
    refreshAuditButton.disabled = false;
    auditCategory.disabled = false;
  }
}

function renderOfficialReports(reports) {
  officialReportsBody.replaceChildren();
  for (const report of reports) {
    const row = document.createElement('tr');
    const stateCell = document.createElement('td');
    stateCell.dataset.label = 'Situação';
    const state = document.createElement('span');
    state.className = `official-report-status ${report.status}`;
    state.textContent = ({ pending: 'Na fila', processing: 'Preparando', ready: 'Pronto', failed: 'Falhou' })[report.status] || report.status;
    state.title = report.errorMessage || '';
    stateCell.append(state);
    const actionCell = document.createElement('td');
    actionCell.dataset.label = 'Ação';
    if (report.status === 'ready') {
      actionCell.classList.add('official-report-actions');
      const download = document.createElement('button');
      download.type = 'button';
      download.className = 'table-action activate';
      download.textContent = 'Baixar PDF';
      download.addEventListener('click', () => void downloadOfficialReport(report.id, download));
      actionCell.append(download);
      if (currentUser?.role === 'admin') {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'table-action danger';
        remove.textContent = 'Excluir';
        remove.addEventListener('click', () => openDeleteOfficialReportDialog(report));
        actionCell.append(remove);
      }
    } else {
      actionCell.textContent = report.status === 'failed' ? 'Revise e solicite novamente' : 'Aguarde';
    }
    row.append(
      td(formatDeviceMoment(report.requestedAt), 'Solicitado em'),
      td(report.cgnat.publicIp, 'IP público', 'ip-value'),
      td(report.cgnat.privateIp, 'IP privado', 'ip-value'),
      td(report.request.referenceNumber || 'Não informado', 'Ofício / processo'),
      td(report.requestedByName, 'Solicitante'),
      stateCell,
      actionCell
    );
    officialReportsBody.append(row);
  }
}

function openDeleteOfficialReportDialog(report) {
  deleteOfficialReportForm.elements.reportId.value = report.id;
  const reference = report.request.referenceNumber
    ? `Ofício / processo ${report.request.referenceNumber}`
    : `Relatório do IP ${report.cgnat.publicIp}`;
  deleteOfficialReportReference.textContent = reference;
  setFormFeedback(deleteOfficialReportFeedback, '');
  deleteOfficialReportDialog.showModal();
}

async function deleteOfficialReport(reportId) {
  const response = await authenticatedFetch(`${API_BASE}/v1/cgnat/official-reports/${reportId}`, {
    method: 'DELETE', headers: { Accept: 'application/json' }
  });
  if (response.ok) return;
  const payload = await response.json().catch(() => ({}));
  const messages = {
    tenant_administrator_required: 'Somente administradores podem excluir relatórios.',
    official_report_not_found: 'Este relatório não existe mais.',
    official_report_not_ready_for_deletion: 'Somente relatórios prontos podem ser excluídos.'
  };
  throw new Error(messages[payload.error] || 'Não foi possível excluir o relatório.');
}

async function loadOfficialReports() {
  if (officialReportsPollTimer) window.clearTimeout(officialReportsPollTimer);
  officialReportsPollTimer = null;
  officialReportsLoading.hidden = false;
  officialReportsEmpty.hidden = true;
  officialReportsWrap.hidden = true;
  refreshOfficialReportsButton.disabled = true;
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/cgnat/official-reports?limit=20`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    if (!response.ok) throw new Error('Não foi possível carregar os relatórios para ofício.');
    const payload = await response.json();
    renderOfficialReports(payload.reports);
    officialReportsLoaded = true;
    officialReportsLoading.hidden = true;
    officialReportsEmpty.hidden = payload.reports.length !== 0;
    officialReportsWrap.hidden = payload.reports.length === 0;
    if (payload.reports.some((report) => ['pending', 'processing'].includes(report.status))) {
      officialReportsPollTimer = window.setTimeout(() => void loadOfficialReports(), 2500);
    }
  } catch (error) {
    officialReportsLoading.hidden = true;
    officialReportsEmpty.hidden = false;
    officialReportsEmpty.querySelector('strong').textContent = 'Não foi possível carregar os relatórios';
    officialReportsEmpty.querySelector('p').textContent = error instanceof Error ? error.message : 'Tente novamente.';
  } finally {
    refreshOfficialReportsButton.disabled = false;
  }
}

async function downloadOfficialReport(reportId, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Baixando…';
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/cgnat/official-reports/${reportId}/download`);
    if (!response.ok) throw new Error('O relatório ainda não está disponível.');
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `relatorio-oficio-${reportId}.pdf`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Falha ao baixar relatório.');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  let query;
  try {
    query = queryFromForm();
  } catch {
    showError('A data e o horário informados não são válidos.');
    return;
  }

  broadNotice.hidden = query.has('port');
  emptyState.hidden = true;
  errorState.hidden = true;
  tableWrap.hidden = true;
  resultTitle.textContent = 'Consultando…';
  auditLine.textContent = 'Pesquisando eventos explícitos recebidos dos equipamentos.';
  setExports(false);
  setSearchLoading(true);

  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/cgnat/search?${query.toString()}`, {
      headers: { Accept: 'application/json' }, cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (payload.error === 'invalid_search_timezone') throw new Error(payload.message || 'Revise o fuso horário informado.');
      throw new Error(payload.error === 'invalid_query' ? 'Revise os campos informados.' : 'O serviço de consulta não respondeu corretamente.');
    }

    lastQuery = query;
    const count = payload.results.length;
    resultTitle.textContent = count === 0 ? 'Nenhuma tradução encontrada' : `${count} ${count === 1 ? 'tradução encontrada' : 'traduções encontradas'}`;
    const resolvedQuery = payload.query;
    lastSearchContext = {
      auditId: payload.auditId,
      searchedAtLocal: resolvedQuery.atLocal,
      searchedTimezone: resolvedQuery.timezone
    };
    auditLine.textContent = `Auditoria ${payload.auditId} · ${resolvedQuery.atLocal.replace('T', ' ')} (${resolvedQuery.timezone}) → ${resolvedQuery.atUtc.replace('.000Z', ' UTC').replace('T', ' ')} · Escopo ${payload.scope === 'broad' ? 'sem porta' : 'com porta'}`;
    renderRows(payload.results, payload.erp?.status);
    tableWrap.hidden = count === 0;
    emptyState.hidden = count !== 0;
    if (count === 0) {
      emptyState.querySelector('strong').textContent = 'Nenhuma correspondência no período';
      emptyState.querySelector('p').textContent = 'Verifique o IP, o horário e os filtros utilizados.';
    }
    setExports(true);
  } catch (error) {
    if (!appShell.hidden) showError(error instanceof Error ? error.message : 'Erro inesperado durante a consulta.');
  } finally {
    setSearchLoading(false);
  }
});

exportButtons.forEach((button) => button.addEventListener('click', async () => {
  if (!lastQuery) return;
  const format = button.dataset.export;
  const query = new URLSearchParams(lastQuery);
  query.set('format', format);
  query.delete('correlateErp');
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Preparando…';
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/cgnat/export?${query.toString()}`);
    if (!response.ok) throw new Error('Não foi possível gerar o arquivo.');
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || `consulta-cgnat.${format}`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    if (!appShell.hidden) showError(error instanceof Error ? error.message : 'Falha ao gerar o arquivo.');
  } finally {
    button.textContent = original;
    setExports(Boolean(lastQuery) && !appShell.hidden);
  }
}));

closeOfficialReportDialogButton.addEventListener('click', () => officialReportDialog.close());
closeDeleteOfficialReportButton.addEventListener('click', () => deleteOfficialReportDialog.close());
closeAllocationCycleDialogButton.addEventListener('click', () => allocationCycleDialog.close());

deleteOfficialReportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const reportId = deleteOfficialReportForm.elements.reportId.value;
  if (!reportId) return;
  setButtonLoading(deleteOfficialReportSubmit, true);
  setFormFeedback(deleteOfficialReportFeedback, 'Excluindo documento…');
  try {
    await deleteOfficialReport(reportId);
    deleteOfficialReportDialog.close();
    officialReportsLoaded = false;
    await loadOfficialReports();
  } catch (error) {
    setFormFeedback(deleteOfficialReportFeedback, error instanceof Error ? error.message : 'Falha ao excluir relatório.', true);
  } finally {
    setButtonLoading(deleteOfficialReportSubmit, false);
  }
});

refreshOfficialReportsButton.addEventListener('click', () => {
  officialReportsLoaded = false;
  void loadOfficialReports();
});

officialReportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!lastSearchContext || !officialReportForm.reportValidity()) return;
  setFormFeedback(officialReportFeedback, '');
  setButtonLoading(generateOfficialReportButton, true);
  const data = new FormData(officialReportForm);
  try {
    const response = await authenticatedFetch(`${API_BASE}/v1/cgnat/official-reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        auditId: lastSearchContext.auditId,
        lastEventId: String(data.get('lastEventId')),
        searchedAtLocal: lastSearchContext.searchedAtLocal,
        searchedTimezone: lastSearchContext.searchedTimezone,
        referenceNumber: String(data.get('referenceNumber') || '').trim(),
        requestingAuthority: String(data.get('requestingAuthority') || '').trim(),
        notes: String(data.get('notes') || '').trim()
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        query_audit_not_found: 'A consulta não está mais disponível para gerar o documento.',
        query_time_mismatch: 'O horário da consulta não corresponde à auditoria registrada.',
        selected_cgnat_record_not_found: 'O registro CGNAT selecionado não pôde ser confirmado.'
      };
      throw new Error(messages[payload.error] || 'Não foi possível solicitar o relatório.');
    }
    officialReportsLoaded = false;
    officialReportDialog.close();
    await loadOfficialReports();
  } catch (error) {
    setFormFeedback(officialReportFeedback, error instanceof Error ? error.message : 'Falha ao solicitar relatório.', true);
  } finally {
    setButtonLoading(generateOfficialReportButton, false);
  }
});

menuButton.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  menuButton.setAttribute('aria-expanded', String(open));
});

ellevenIntegrationForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void (async () => {
    const saved = await saveIntegration();
    if (!saved) return;
    integrationWizardDialog.close();
    integrationsLoaded = false;
    await loadIntegrations();
  })();
});

testRadiusButton.addEventListener('click', () => void testIntegrationSource('radius'));
testVoalleDatabaseButton.addEventListener('click', () => void testIntegrationSource('voalleDatabase'));
addIntegrationButton.addEventListener('click', openIntegrationCatalog);
addFirstIntegrationButton.addEventListener('click', openIntegrationCatalog);
closeIntegrationCatalogButton.addEventListener('click', () => integrationCatalogDialog.close());
selectEllevenIntegrationButton.addEventListener('click', () => {
  integrationCatalogDialog.close();
  openIntegrationWizard(false);
});
editIntegrationButton.addEventListener('click', () => openIntegrationWizard(true));
closeIntegrationWizardButton.addEventListener('click', () => integrationWizardDialog.close());
integrationWizardBackButton.addEventListener('click', () => setIntegrationWizardStep(integrationWizardStep - 1));
integrationWizardNextButton.addEventListener('click', () => {
  const test = integrationWizardStep === 1
    ? currentIntegration?.radius?.lastTest
    : currentIntegration?.voalleDatabase?.lastTest;
  const feedback = integrationWizardStep === 1
    ? radiusTestFeedback
    : voalleDatabaseTestFeedback;
  if (test?.status !== 'success') {
    setFormFeedback(feedback, 'Execute e aprove o teste desta etapa antes de continuar.', true);
    return;
  }
  setIntegrationWizardStep(integrationWizardStep + 1);
});
deleteIntegrationButton.addEventListener('click', () => {
  setFormFeedback(deleteIntegrationFeedback, '');
  deleteIntegrationDialog.showModal();
});
closeDeleteIntegrationButton.addEventListener('click', () => deleteIntegrationDialog.close());
deleteIntegrationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setButtonLoading(confirmDeleteIntegrationButton, true);
  setFormFeedback(deleteIntegrationFeedback, 'Excluindo integração…');
  try {
    await removeIntegration();
    deleteIntegrationDialog.close();
    integrationsLoaded = false;
    await loadIntegrations();
  } catch (error) {
    setFormFeedback(deleteIntegrationFeedback, error instanceof Error ? error.message : 'Falha ao excluir integração.', true);
  } finally {
    setButtonLoading(confirmDeleteIntegrationButton, false);
  }
});
integrationTenant.addEventListener('change', () => {
  integrationsLoaded = false;
  void loadIntegrations();
});
platformEllevenEnabled.addEventListener('change', () => {
  void updatePlatformIntegrationAvailability(platformEllevenEnabled.checked);
});

function normalizedManualText(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

manualIndexButtons.forEach((button) => button.addEventListener('click', () => {
  const section = document.getElementById(button.dataset.manualTarget);
  if (!section || section.hidden) return;
  manualIndexButtons.forEach((candidate) => candidate.classList.toggle('active', candidate === button));
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}));

manualSearch.addEventListener('input', () => {
  const query = normalizedManualText(manualSearch.value);
  let visibleSections = 0;
  manualSections.forEach((section) => {
    const visible = !query || normalizedManualText(section.textContent).includes(query);
    section.hidden = !visible;
    const indexButton = manualIndexButtons.find((button) => button.dataset.manualTarget === section.id);
    if (indexButton) indexButton.hidden = !visible;
    if (visible) visibleSections += 1;
  });
  manualSearchEmpty.hidden = visibleSections > 0;
  const firstVisibleButton = manualIndexButtons.find((button) => !button.hidden);
  manualIndexButtons.forEach((button) => button.classList.toggle('active', button === firstVisibleButton));
});

printManualButton.addEventListener('click', () => window.print());

navLinks.forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  const view = link.dataset.view;
  window.history.pushState(null, '', link.getAttribute('href'));
  navigateTo(view);
}));

refreshPlatformDashboardButton.addEventListener('click', () => {
  platformDashboardLoaded = false;
  void loadPlatformDashboard();
});

platformDashboardPeriod.addEventListener('change', () => {
  platformDashboardLoaded = false;
  void loadPlatformDashboard();
});

platformDashboardOpenAlerts.addEventListener('click', () => {
  window.history.pushState(null, '', '#alertas');
  navigateTo('alerts');
});

returnPlatformButton.addEventListener('click', () => void changeTenantContext(null, returnPlatformButton));

refreshDashboardButton.addEventListener('click', () => {
  dashboardLoaded = false;
  void loadDashboard();
});

dashboardPeriod.addEventListener('change', () => {
  dashboardLoaded = false;
  void loadDashboard();
});

refreshDevicesButton.addEventListener('click', () => {
  devicesLoaded = false;
  void loadDevices();
});

refreshCollectorsButton.addEventListener('click', () => {
  collectorsLoaded = false;
  void loadCollectors();
});

refreshFirewallButton.addEventListener('click', () => {
  firewallLoaded = false;
  void loadFirewall();
});

firewallAccessTab.addEventListener('click', () => selectFirewallTab('access'));
firewallIngestionTab.addEventListener('click', () => selectFirewallTab('ingestion'));
firewallRuleSearch.addEventListener('input', () => renderInfrastructureFirewall(latestInfrastructureFirewallPolicies));
firewallRuleFilter.addEventListener('change', () => renderInfrastructureFirewall(latestInfrastructureFirewallPolicies));
firewallNewRuleButton.addEventListener('click', () => openFirewallRuleDialog());
closeFirewallRuleDialog.addEventListener('click', () => firewallRuleDialog.close());
firewallRuleForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveInfrastructureFirewallRule();
});

refreshSystemButton.addEventListener('click', () => {
  systemLoaded = false;
  void loadSystem();
});

refreshAlertsButton.addEventListener('click', () => {
  alertsLoaded = false;
  void loadAlerts();
});

refreshServersButton.addEventListener('click', () => {
  serversLoaded = false;
  void loadServers();
});

refreshContinuityButton.addEventListener('click', () => {
  continuityLoaded = false;
  continuityEnrollmentLoaded = false;
  void loadContinuity();
  void loadContinuityEnrollment();
});

serverHistoryServer.addEventListener('change', () => {
  void loadServerHistory(true);
});

serverHistoryPeriodButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const period = button.dataset.serverPeriod;
    if (!period || period === serverHistoryPeriod) return;
    serverHistoryPeriod = period;
    serverHistoryPeriodButtons.forEach((candidate) => candidate.classList.toggle('active', candidate === button));
    void loadServerHistory(true);
  });
});

refreshCapacityButton.addEventListener('click', () => {
  capacityLoaded = false;
  void loadCapacity();
});

capacityLiveTab.addEventListener('click', () => selectCapacityTab('live'));
capacityCalculatorTab.addEventListener('click', () => selectCapacityTab('calculator'));
capacityVendorScenario.addEventListener('change', syncCapacityVendorScenario);
capacityCalculatorForm.addEventListener('submit', calculateStorageEstimate);
syncCapacityVendorScenario();

refreshClientsButton.addEventListener('click', () => {
  clientsLoaded = false;
  void loadClients();
});

refreshPlansButton.addEventListener('click', () => {
  plansLoaded = false;
  void loadPlans();
});

refreshPlatformEmailButton.addEventListener('click', () => {
  platformEmailLoaded = false;
  void loadPlatformEmailSettings();
});

refreshUsersButton.addEventListener('click', () => {
  usersLoaded = false;
  void loadUsers();
});

refreshAuditButton.addEventListener('click', () => {
  auditLoaded = false;
  void loadAudit();
});

auditCategory.addEventListener('change', () => {
  auditLoaded = false;
  void loadAudit();
});

window.addEventListener('popstate', () => {
  if (!appShell.hidden) navigateTo(viewFromLocation());
});

if (activePasswordResetToken) {
  loginScreen.hidden = false;
  appShell.hidden = true;
  selectLoginMode('reset');
  window.setTimeout(() => passwordResetForm.elements.newPassword.focus(), 0);
} else {
  void restoreSession();
}

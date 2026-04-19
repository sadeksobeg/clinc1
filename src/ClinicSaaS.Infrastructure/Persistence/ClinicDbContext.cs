using System.Linq.Expressions;
using System.Text.Json;
using ClinicSaaS.Application.Tenancy;
using ClinicSaaS.Domain.Abstractions;
using ClinicSaaS.Domain.Entities;
using ClinicSaaS.Domain.WorkingHours;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ClinicSaaS.Infrastructure.Persistence;

public sealed class ClinicDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    private readonly ICurrentTenant _currentTenant;

    public Guid CurrentTenantId => _currentTenant.TenantId;

    public ClinicDbContext(DbContextOptions<ClinicDbContext> options, ICurrentTenant currentTenant) : base(options)
    {
        _currentTenant = currentTenant;
    }

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public new DbSet<User> Users => Set<User>();
    public DbSet<Doctor> Doctors => Set<Doctor>();
    public DbSet<Patient> Patients => Set<Patient>();
    public DbSet<VisitType> VisitTypes => Set<VisitType>();
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<DoctorStatus> DoctorStatuses => Set<DoctorStatus>();
    public DbSet<ConversationState> ConversationStates => Set<ConversationState>();
    public DbSet<Plan> Plans => Set<Plan>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<BillingPeriod> BillingPeriods => Set<BillingPeriod>();
    public DbSet<SubscriptionRequest> SubscriptionRequests => Set<SubscriptionRequest>();
    public DbSet<SubscriptionAuditLog> SubscriptionAuditLogs => Set<SubscriptionAuditLog>();
    public DbSet<MarketingLead> MarketingLeads => Set<MarketingLead>();
    public DbSet<AddonCatalogItem> AddonCatalogItems => Set<AddonCatalogItem>();
    public DbSet<TenantAddonSubscription> TenantAddonSubscriptions => Set<TenantAddonSubscription>();
    public DbSet<SubscriptionRequestStatusHistory> SubscriptionRequestStatusHistory => Set<SubscriptionRequestStatusHistory>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceLine> InvoiceLines => Set<InvoiceLine>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentAttempt> PaymentAttempts => Set<PaymentAttempt>();
    public DbSet<BillingAdjustment> BillingAdjustments => Set<BillingAdjustment>();
    public DbSet<PlanVersion> PlanVersions => Set<PlanVersion>();
    public DbSet<SubscriptionContract> SubscriptionContracts => Set<SubscriptionContract>();
    public DbSet<BillingAuditLog> BillingAuditLogs => Set<BillingAuditLog>();
    public DbSet<Wallet> Wallets => Set<Wallet>();
    public DbSet<WalletTransaction> WalletTransactions => Set<WalletTransaction>();
    public DbSet<PaymentVerification> PaymentVerifications => Set<PaymentVerification>();
    public DbSet<LedgerAccount> LedgerAccounts => Set<LedgerAccount>();
    public DbSet<LedgerEntry> LedgerEntries => Set<LedgerEntry>();
    public DbSet<PredictionOutcome> PredictionOutcomes => Set<PredictionOutcome>();
    public DbSet<CommunicationConversation> CommunicationConversations => Set<CommunicationConversation>();
    public DbSet<CommunicationTemplate> CommunicationTemplates => Set<CommunicationTemplate>();
    public DbSet<CommunicationCampaign> CommunicationCampaigns => Set<CommunicationCampaign>();
    public DbSet<OnboardingChecklistState> OnboardingChecklistStates => Set<OnboardingChecklistState>();
    public DbSet<PlatformAuditLog> PlatformAuditLogs => Set<PlatformAuditLog>();
    public DbSet<SupportConversation> SupportConversations => Set<SupportConversation>();
    public DbSet<SupportMessage> SupportMessages => Set<SupportMessage>();
    public DbSet<ConversationParticipant> ConversationParticipants => Set<ConversationParticipant>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<DecisionTelemetryEvent> DecisionTelemetryEvents => Set<DecisionTelemetryEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Tenant>().ToTable("Tenants");
        modelBuilder.Entity<User>().ToTable("Users");
        modelBuilder.Entity<Doctor>().ToTable("Doctors");
        modelBuilder.Entity<Patient>().ToTable("Patients");
        modelBuilder.Entity<VisitType>().ToTable("VisitTypes");
        modelBuilder.Entity<Appointment>().ToTable("Appointments");
        modelBuilder.Entity<DoctorStatus>().ToTable("DoctorStatuses");
        modelBuilder.Entity<ConversationState>().ToTable("ConversationStates");
        modelBuilder.Entity<Plan>().ToTable("Plans");
        modelBuilder.Entity<Subscription>().ToTable("Subscriptions");
        modelBuilder.Entity<BillingPeriod>().ToTable("BillingPeriods");
        modelBuilder.Entity<SubscriptionRequest>().ToTable("SubscriptionRequests");
        modelBuilder.Entity<SubscriptionAuditLog>().ToTable("SubscriptionAuditLogs");
        modelBuilder.Entity<MarketingLead>().ToTable("MarketingLeads");
        modelBuilder.Entity<AddonCatalogItem>().ToTable("AddonCatalogItems");
        modelBuilder.Entity<TenantAddonSubscription>().ToTable("TenantAddonSubscriptions");
        modelBuilder.Entity<SubscriptionRequestStatusHistory>().ToTable("SubscriptionRequestStatusHistory");
        modelBuilder.Entity<Invoice>().ToTable("Invoices");
        modelBuilder.Entity<InvoiceLine>().ToTable("InvoiceLines");
        modelBuilder.Entity<Payment>().ToTable("Payments");
        modelBuilder.Entity<PaymentAttempt>().ToTable("PaymentAttempts");
        modelBuilder.Entity<BillingAdjustment>().ToTable("BillingAdjustments");
        modelBuilder.Entity<PlanVersion>().ToTable("PlanVersions");
        modelBuilder.Entity<SubscriptionContract>().ToTable("SubscriptionContracts");
        modelBuilder.Entity<BillingAuditLog>().ToTable("BillingAuditLogs");
        modelBuilder.Entity<Wallet>().ToTable("Wallets");
        modelBuilder.Entity<WalletTransaction>().ToTable("WalletTransactions");
        modelBuilder.Entity<PaymentVerification>().ToTable("PaymentVerifications");
        modelBuilder.Entity<LedgerAccount>().ToTable("LedgerAccounts");
        modelBuilder.Entity<LedgerEntry>().ToTable("LedgerEntries");
        modelBuilder.Entity<PredictionOutcome>().ToTable("PredictionOutcomes");
        modelBuilder.Entity<CommunicationConversation>().ToTable("CommunicationConversations");
        modelBuilder.Entity<CommunicationTemplate>().ToTable("CommunicationTemplates");
        modelBuilder.Entity<CommunicationCampaign>().ToTable("CommunicationCampaigns");
        modelBuilder.Entity<OnboardingChecklistState>().ToTable("OnboardingChecklistStates");
        modelBuilder.Entity<PlatformAuditLog>().ToTable("PlatformAuditLogs");
        modelBuilder.Entity<SupportConversation>().ToTable("SupportConversations");
        modelBuilder.Entity<SupportMessage>().ToTable("SupportMessages");
        modelBuilder.Entity<ConversationParticipant>().ToTable("ConversationParticipants");
        modelBuilder.Entity<DecisionTelemetryEvent>().ToTable("DecisionTelemetryEvents");
        modelBuilder.Entity<ApplicationUser>().ToTable("AspNetUsers");
        modelBuilder.Entity<IdentityRole<Guid>>().ToTable("AspNetRoles");
        modelBuilder.Entity<IdentityUserRole<Guid>>().ToTable("AspNetUserRoles");
        modelBuilder.Entity<IdentityUserClaim<Guid>>().ToTable("AspNetUserClaims");
        modelBuilder.Entity<IdentityUserLogin<Guid>>().ToTable("AspNetUserLogins");
        modelBuilder.Entity<IdentityUserToken<Guid>>().ToTable("AspNetUserTokens");
        modelBuilder.Entity<IdentityRoleClaim<Guid>>().ToTable("AspNetRoleClaims");
        modelBuilder.Entity<RefreshToken>().ToTable("RefreshTokens");

        modelBuilder.Entity<ConversationState>()
            .Property(c => c.Data)
            .HasColumnType("jsonb");

        modelBuilder.Entity<ConversationState>()
            .HasIndex(c => new { c.TenantId, c.Phone })
            .IsUnique();

        modelBuilder.Entity<Appointment>()
            .HasIndex(a => new { a.TenantId, a.DoctorId, a.QueueDate, a.QueueNumber })
            .IsUnique();
        modelBuilder.Entity<Appointment>()
            .HasIndex(a => new { a.TenantId, a.StartTime });
        modelBuilder.Entity<Appointment>()
            .HasIndex(a => new { a.TenantId, a.DoctorId, a.StartTime });
        modelBuilder.Entity<SubscriptionRequest>()
            .HasIndex(x => new { x.TenantId, x.Status, x.CreatedAtUtc });
        modelBuilder.Entity<Plan>()
            .HasIndex(x => x.Name)
            .IsUnique();
        modelBuilder.Entity<Subscription>()
            .HasIndex(x => x.TenantId)
            .IsUnique();
        modelBuilder.Entity<Subscription>()
            .HasIndex(x => new { x.Status, x.EndDate });
        modelBuilder.Entity<BillingPeriod>()
            .HasIndex(x => new { x.SubscriptionId, x.StartsAt, x.EndsAt });
        modelBuilder.Entity<BillingPeriod>()
            .HasIndex(x => new { x.TenantId, x.IsCurrent });
        modelBuilder.Entity<SubscriptionAuditLog>()
            .HasIndex(x => new { x.TenantId, x.CreatedAtUtc });
        modelBuilder.Entity<MarketingLead>()
            .HasIndex(x => x.CreatedAtUtc);
        modelBuilder.Entity<AddonCatalogItem>()
            .HasIndex(x => x.Code)
            .IsUnique();
        modelBuilder.Entity<TenantAddonSubscription>()
            .HasIndex(x => new { x.TenantId, x.AddonCatalogItemId });
        modelBuilder.Entity<SubscriptionRequestStatusHistory>()
            .HasIndex(x => new { x.TenantId, x.SubscriptionRequestId, x.CreatedAtUtc });
        modelBuilder.Entity<Invoice>()
            .HasIndex(x => x.InvoiceNumber)
            .IsUnique();
        modelBuilder.Entity<Invoice>()
            .HasIndex(x => new { x.TenantId, x.Status, x.IssuedAtUtc });
        modelBuilder.Entity<InvoiceLine>()
            .HasIndex(x => new { x.TenantId, x.InvoiceId });
        modelBuilder.Entity<Payment>()
            .HasIndex(x => new { x.InvoiceId, x.CreatedAt });
        modelBuilder.Entity<PaymentAttempt>()
            .HasIndex(x => new { x.PaymentId, x.AttemptedAt });
        modelBuilder.Entity<BillingAdjustment>()
            .HasIndex(x => new { x.SubscriptionId, x.ApprovedAt });
        modelBuilder.Entity<PlanVersion>()
            .HasIndex(x => new { x.PlanId, x.Version })
            .IsUnique();
        modelBuilder.Entity<SubscriptionContract>()
            .HasIndex(x => x.SubscriptionId)
            .IsUnique();
        modelBuilder.Entity<BillingAuditLog>()
            .HasIndex(x => new { x.TenantId, x.CreatedAtUtc });
        modelBuilder.Entity<Wallet>()
            .HasIndex(x => x.TenantId)
            .IsUnique();
        modelBuilder.Entity<WalletTransaction>()
            .HasIndex(x => new { x.WalletId, x.CreatedAtUtc });
        modelBuilder.Entity<PaymentVerification>()
            .HasIndex(x => x.PaymentId)
            .IsUnique();
        modelBuilder.Entity<LedgerAccount>()
            .HasIndex(x => new { x.TenantId, x.Code })
            .IsUnique();
        modelBuilder.Entity<LedgerEntry>()
            .HasIndex(x => new { x.TenantId, x.ReferenceType, x.ReferenceId });
        modelBuilder.Entity<PredictionOutcome>()
            .HasIndex(x => new { x.TenantId, x.PredictionId, x.RecordedAtUtc });
        modelBuilder.Entity<CommunicationConversation>()
            .HasIndex(x => new { x.TenantId, x.Channel, x.UpdatedAtUtc });
        modelBuilder.Entity<CommunicationTemplate>()
            .HasIndex(x => new { x.TenantId, x.Code })
            .IsUnique();
        modelBuilder.Entity<CommunicationCampaign>()
            .HasIndex(x => new { x.TenantId, x.Status, x.CreatedAtUtc });
        modelBuilder.Entity<OnboardingChecklistState>()
            .HasIndex(x => x.TenantId)
            .IsUnique();
        modelBuilder.Entity<PlatformAuditLog>()
            .HasIndex(x => x.Timestamp);
        modelBuilder.Entity<PlatformAuditLog>()
            .HasIndex(x => x.ActorUserId);
        modelBuilder.Entity<SupportConversation>()
            .HasIndex(x => new { x.TenantId, x.Status, x.UpdatedAtUtc });
        modelBuilder.Entity<SupportMessage>()
            .HasIndex(x => new { x.TenantId, x.ConversationId, x.CreatedAtUtc });
        modelBuilder.Entity<ConversationParticipant>()
            .HasIndex(x => new { x.TenantId, x.ConversationId, x.UserId })
            .IsUnique();
        modelBuilder.Entity<User>()
            .HasIndex(x => new { x.TenantId, x.Role, x.IsDisabled });
        modelBuilder.Entity<User>()
            .HasIndex(x => new { x.TenantId, x.LastSeenAt });
        modelBuilder.Entity<ApplicationUser>()
            .HasIndex(x => new { x.TenantId, x.RoleType, x.IsActive });
        modelBuilder.Entity<RefreshToken>()
            .HasIndex(x => new { x.UserId, x.ExpiresAtUtc });
        modelBuilder.Entity<RefreshToken>()
            .HasIndex(x => x.TokenHash)
            .IsUnique();
        modelBuilder.Entity<DecisionTelemetryEvent>()
            .HasIndex(x => new { x.TenantId, x.TimestampUtc });
        modelBuilder.Entity<DecisionTelemetryEvent>()
            .HasIndex(x => new { x.DecisionId, x.ActionId, x.TimestampUtc });

        // Store WorkingHours as jsonb.
        var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        modelBuilder.Entity<Doctor>()
            .Property(d => d.WorkingHours)
            .HasConversion(
                v => JsonSerializer.Serialize(v, jsonOptions),
                v => JsonSerializer.Deserialize<WorkingHours>(v, jsonOptions)!)
            .HasColumnType("jsonb");

        // Apply tenant isolation to all ITenantEntity tables.
        var tenantEntityType = typeof(ITenantEntity);
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            var clrType = entityType.ClrType;
            if (clrType == null || !tenantEntityType.IsAssignableFrom(clrType))
                continue;

            // Build: e => e.TenantId == CurrentTenantId
            var parameter = Expression.Parameter(clrType, "e");
            var tenantIdProperty = Expression.Property(parameter, nameof(ITenantEntity.TenantId));
            var currentTenantIdProperty = Expression.Property(Expression.Constant(this), nameof(CurrentTenantId));
            var body = Expression.Equal(tenantIdProperty, currentTenantIdProperty);

            var lambda = Expression.Lambda(body, parameter);
            entityType.SetQueryFilter(lambda);
        }
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var tenantId = _currentTenant.TenantId;

        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.Entity is not ITenantEntity tenantEntity)
                continue;

            if (entry.State == EntityState.Added)
            {
                if (tenantId == Guid.Empty)
                {
                    if (tenantEntity.TenantId == Guid.Empty)
                        throw new InvalidOperationException("TenantId is not resolved for this request.");
                }
                else
                {
                    tenantEntity.TenantId = tenantId;
                }
            }
            else if (entry.State == EntityState.Modified)
            {
                if (tenantId != Guid.Empty && tenantEntity.TenantId != tenantId)
                    throw new InvalidOperationException("Attempt to modify an entity from another tenant.");
            }
        }

        return await base.SaveChangesAsync(cancellationToken);
    }
}


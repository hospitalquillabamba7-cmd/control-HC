/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';

// Type declarations for global libraries from script tags
declare const XLSX: any;
declare global {
    interface Window {
        jspdf: any;
    }
}

// Define data shapes
interface User {
    username: string;
    password: string;
    role: 'admin' | 'invitado';
    service?: string;
}

interface ClinicalDetails {
    antecedents: string;
    notes: string;
}

interface Record {
    id: number;
    hcNumber: string;
    destinationService: string;
    responsible: string;
    responsiblePhoneNumber: string;
    requestDate: string; // YYYY-MM-DDTHH:mm
    status: 'Prestado' | 'Devuelto' | 'Pendiente de Devolución' | 'Transferido';
    returnDate: string | null; // YYYY-MM-DDTHH:mm
    receivingStaffName: string | null;
}

interface Request {
    id: number;
    hcNumbers: string;
    destinationService: string;
    requesterName: string;
    requestTimestamp: number;
}

interface PendingTransfer {
    id: number;
    recordId: number;
    hcNumber: string;
    fromService: string;
    toService: string;
    requesterName: string;
    requestTimestamp: number;
}

interface Notification {
    id: number;
    userId: string;
    message: string;
    timestamp: number;
    isRead: boolean;
    type: 'rejection' | 'approval';
}

type FormData = Omit<Record, 'id' | 'status' | 'returnDate' | 'receivingStaffName'>;
type RequestFormData = Omit<Request, 'id' | 'requestTimestamp'>;

const ICONS = {
    EDIT: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"></path></svg>,
    DELETE: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg>,
    RETURN: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 15l-1.41-1.41L13 18.17V2h-2v16.17l-4.59-4.58L5 15l7 7 7-7z"></path></svg>,
    PDF: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zM18 14H15v-1.5h3V14zm-3-2.5h-1.5V7H18v1.5h-3v3zM14.5 9.5h-1.5V7h1.5v2.5zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z"></path></svg>,
    EXCEL: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 2v20h20V2H2zm18 18H4V4h16v16zM13.15 15.85l-1.8-3.61-1.81 3.61H7.21l3.2-5.4-3.2-5.4h2.33l1.81 3.61 1.8-3.61h2.33l-3.2 5.4 3.2 5.4h-2.32z"></path></svg>,
    TRANSFER: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zm10.02 0-3.99-4v3H10v2h7.01v3z"></path></svg>,
    BELL: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"></path></svg>,
    APPROVE_RETURN: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"></path></svg>
};

// Helper to format a datetime string into DD/MM/YYYY HH:mm
const formatDateTime = (isoString: string | null): string => {
    if (!isoString) return 'Pendiente';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return 'Fecha inválida';
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (e) {
        return 'Fecha inválida';
    }
};

const getLocalDateTimeString = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
};

// --- Child Components ---

const LoginScreen = ({ onLogin, users }: { onLogin: (u: string, p: string) => void, users: User[] }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (username && password) onLogin(username, password);
    };
    return (
        <div className="login-container">
            <div className="card login-card">
                <h2>Iniciar Sesión</h2>
                <p>Ingrese sus credenciales para continuar.</p>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="username">Usuario</label>
                        <input list="users" id="username" className="form-control" value={username} onChange={e => setUsername(e.target.value)} autoFocus required />
                        <datalist id="users">
                            {users.map(u => <option key={u.username} value={u.username} />)}
                        </datalist>
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Contraseña</label>
                        <input type="password" id="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required />
                    </div>
                    <div className="btn-container">
                        <button type="submit" className="btn btn-primary" style={{width: '100%'}}>Ingresar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const UserManagementModal = ({ users, onAddUser, onDeleteUser, onClose }: {
    users: User[],
    onAddUser: (user: User) => boolean,
    onDeleteUser: (username: string) => void,
    onClose: () => void
}) => {
    const [newUsername, setNewUsername] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState<'admin' | 'invitado'>('invitado');
    const [newUserService, setNewUserService] = useState('');

    const handleAddUserSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const success = onAddUser({ 
            username: newUsername, 
            password: newUserPassword, 
            role: newUserRole, 
            service: newUserRole === 'invitado' ? newUserService : undefined 
        });
        if (success) {
            setNewUsername('');
            setNewUserPassword('');
            setNewUserRole('invitado');
            setNewUserService('');
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h3>Gestionar Usuarios</h3>
                <form onSubmit={handleAddUserSubmit}>
                    <div className="form-group"><label>Nuevo Usuario</label><input type="text" className="form-control" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Nombre de usuario" required/></div>
                    <div className="form-group"><label>Contraseña</label><input type="password" className="form-control" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="Contraseña" required/></div>
                    <div className="form-group"><label>Rol</label><select className="form-control" value={newUserRole} onChange={e => setNewUserRole(e.target.value as any)}><option value="invitado">Invitado</option><option value="admin">Admin</option></select></div>
                    {newUserRole === 'invitado' && (
                        <div className="form-group">
                            <label>Servicio Asignado</label>
                            <input type="text" className="form-control" value={newUserService} onChange={e => setNewUserService(e.target.value)} placeholder="Ej: Pediatría" required/>
                        </div>
                    )}
                    <button type="submit" className="btn btn-primary">Agregar Usuario</button>
                </form>
                <hr style={{ margin: '1.5rem 0' }}/>
                <h4>Usuarios Existentes</h4>
                <ul className="user-list">
                    {users.map(user => (
                        <li key={user.username} className="user-list-item">
                            <div>
                                {user.username} 
                                <span className="badge">{user.role}</span>
                                {user.role === 'invitado' && user.service && <span className="service-tag">{user.service}</span>}
                            </div>
                            {user.username !== 'admin' && <button onClick={() => onDeleteUser(user.username)} className="icon-btn delete" title="Eliminar">{ICONS.DELETE}</button>}
                        </li>
                    ))}
                </ul>
                <div className="btn-container modal-buttons"><button onClick={onClose} className="btn btn-secondary">Cerrar</button></div>
            </div>
        </div>
    );
};


const HistoryDetailModal = ({ hcNumber, details, setDetails, records, onClose, isAdmin, onDeleteHistory }: any) => {
    const [currentDetails, setCurrentDetails] = useState<ClinicalDetails>(details || { antecedents: '', notes: '' });
    const handleSave = () => {
        setDetails((prev: any) => ({ ...prev, [hcNumber]: currentDetails }));
        alert('Detalles guardados.');
    };
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
                <h3>Detalles de Historia Clínica: {hcNumber}</h3>
                <div className="detail-sections">
                    <div className="form-group"><label htmlFor="antecedents">Antecedentes</label><textarea id="antecedents" className="form-control" value={currentDetails.antecedents} onChange={e => setCurrentDetails({...currentDetails, antecedents: e.target.value})} readOnly={!isAdmin}></textarea></div>
                    <div className="form-group"><label htmlFor="notes">Notas Adicionales</label><textarea id="notes" className="form-control" value={currentDetails.notes} onChange={e => setCurrentDetails({...currentDetails, notes: e.target.value})} readOnly={!isAdmin}></textarea></div>
                </div>
                <h4>Historial de Movimientos</h4>
                <div className="table-container history-list-container">
                    <table className="history-table history-list-table">
                        <thead><tr><th>Servicio</th><th>Responsable</th><th>F. Préstamo</th><th>F. Devolución</th><th>Recepcionado por</th><th>Estado</th></tr></thead>
                        <tbody>
                            {records.length > 0 ? records.map((rec: Record) => (
                                <tr key={rec.id}><td>{rec.destinationService}</td><td>{rec.responsible}</td><td>{formatDateTime(rec.requestDate)}</td><td>{formatDateTime(rec.returnDate)}</td><td>{rec.receivingStaffName || '—'}</td><td>{rec.status}</td></tr>
                            )) : <tr><td colSpan={6} style={{textAlign: 'center'}}>No hay movimientos.</td></tr>}
                        </tbody>
                    </table>
                </div>
                <div className="btn-container modal-buttons">
                    {isAdmin && <button onClick={() => onDeleteHistory(hcNumber)} className="btn btn-danger" style={{marginRight: 'auto'}}>Eliminar Historia Completa</button>}
                    {isAdmin && <button onClick={handleSave} className="btn btn-primary">Guardar Cambios</button>}
                    <button onClick={onClose} className="btn btn-secondary">Cerrar</button>
                </div>
            </div>
        </div>
    );
};

const ReturnModal = ({ onConfirm, onCancel, date, setDate, staff, setStaff }: any) => (
    <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Confirmar Devolución</h3>
            <p>Complete los datos para registrar la devolución.</p>
            <div className="form-group"><label htmlFor="returnDateInput">Fecha y Hora de Devolución</label><input type="datetime-local" id="returnDateInput" className="form-control" value={date} onChange={e => setDate(e.target.value)} required/></div>
            <div className="form-group"><label htmlFor="receivingStaffInput">Recepcionado por</label><input type="text" id="receivingStaffInput" className="form-control" value={staff} onChange={e => setStaff(e.target.value)} placeholder="Nombre del personal" required/></div>
            <div className="btn-container modal-buttons"><button onClick={onConfirm} className="btn btn-primary">Confirmar</button><button onClick={onCancel} className="btn btn-secondary">Cancelar</button></div>
        </div>
    </div>
);

const DeleteModal = ({ onConfirm, onCancel }: any) => (
    <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Confirmar Eliminación</h3>
            <p>¿Está seguro de que desea eliminar este registro? Esta acción no se puede deshacer.</p>
            <div className="btn-container modal-buttons"><button onClick={onConfirm} className="btn btn-danger">Eliminar</button><button onClick={onCancel} className="btn btn-secondary">Cancelar</button></div>
        </div>
    </div>
);

const DeleteUserModal = ({ username, onConfirm, onCancel }: { username: string, onConfirm: () => void, onCancel: () => void }) => (
    <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Confirmar Eliminación de Usuario</h3>
            <p>
                ¿Está seguro de que desea eliminar al usuario <strong>"{username}"</strong>? 
                Se eliminarán también todas sus solicitudes pendientes y notificaciones asociadas.
                Esta acción no se puede deshacer.
            </p>
            <div className="btn-container modal-buttons">
                <button onClick={onConfirm} className="btn btn-danger">Confirmar Eliminación</button>
                <button onClick={onCancel} className="btn btn-secondary">Cancelar</button>
            </div>
        </div>
    </div>
);


const RejectionModal = ({ onConfirm, onCancel, reason, setReason }: any) => (
    <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Rechazar Solicitud</h3>
            <p>Por favor, ingrese el motivo del rechazo. El solicitante será notificado.</p>
            <div className="form-group">
                <label htmlFor="rejectionReason">Motivo del Rechazo</label>
                <textarea id="rejectionReason" className="form-control" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: La historia clínica no se encuentra disponible." rows={3} required />
            </div>
            <div className="btn-container modal-buttons">
                <button onClick={onConfirm} className="btn btn-danger" disabled={!reason.trim()}>Confirmar Rechazo</button>
                <button onClick={onCancel} className="btn btn-secondary">Cancelar</button>
            </div>
        </div>
    </div>
);

const NotificationsPanel = ({ notifications, onClose }: { notifications: Notification[], onClose: () => void }) => {
    const sortedNotifications = [...notifications].sort((a, b) => b.timestamp - a.timestamp);
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content notifications-panel" onClick={e => e.stopPropagation()}>
                <h3>Notificaciones</h3>
                {sortedNotifications.length > 0 ? (
                    <ul className="notifications-list">
                        {sortedNotifications.map(n => (
                            <li key={n.id} className={`notification-item notification-${n.type}`}>
                                <p>{n.message}</p>
                                <span className="notification-time">{new Date(n.timestamp).toLocaleString('es-ES')}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p style={{textAlign: 'center', padding: '1rem 0'}}>No tiene notificaciones.</p>
                )}
                <div className="btn-container modal-buttons">
                    <button onClick={onClose} className="btn btn-secondary">Cerrar</button>
                </div>
            </div>
        </div>
    );
};

const TransferModal = ({ onConfirm, onCancel, services, selectedService, setSelectedService, hcNumber }: {
    onConfirm: () => void;
    onCancel: () => void;
    services: string[];
    selectedService: string;
    setSelectedService: (service: string) => void;
    hcNumber: string;
}) => (
    <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Transferir Historia Clínica</h3>
            <p>Seleccione el servicio de destino para la H.C. N° <strong>{hcNumber}</strong>. La transferencia deberá ser aprobada por el servicio receptor.</p>
            <div className="form-group">
                <label htmlFor="transferServiceSelect">Nuevo Servicio de Destino</label>
                <select 
                    id="transferServiceSelect" 
                    className="form-control" 
                    value={selectedService} 
                    onChange={e => setSelectedService(e.target.value)} 
                    required
                >
                    <option value="" disabled>Seleccione un servicio...</option>
                    {services.map(service => (
                        <option key={service} value={service}>{service}</option>
                    ))}
                </select>
            </div>
            <div className="btn-container modal-buttons">
                <button onClick={onConfirm} className="btn btn-primary" disabled={!selectedService}>Solicitar Transferencia</button>
                <button onClick={onCancel} className="btn btn-secondary">Cancelar</button>
            </div>
        </div>
    </div>
);

const App = () => {
    const initialFormState: FormData = {
        hcNumber: '', destinationService: '', responsible: '', responsiblePhoneNumber: '', requestDate: getLocalDateTimeString(),
    };
     const initialRequestFormState: RequestFormData = {
        hcNumbers: '', destinationService: '', requesterName: ''
    };

    // State
    const [currentUser, setCurrentUser] = useState<User | null>(() => {
        try {
            const savedUser = sessionStorage.getItem('currentUser');
            return savedUser ? JSON.parse(savedUser) : null;
        } catch { return null; }
    });
    const [users, setUsers] = useState<User[]>(() => {
        try {
            const saved = localStorage.getItem('clinicalHistoryUsers');
            const parsed = saved ? JSON.parse(saved) : null;
            if (parsed && parsed.length > 0 && parsed[0].password) { return parsed; }
            const defaultAdmin: User[] = [{ username: 'admin', password: 'admin', role: 'admin' }];
            localStorage.setItem('clinicalHistoryUsers', JSON.stringify(defaultAdmin));
            return defaultAdmin;
        } catch { 
            const defaultAdmin: User[] = [{ username: 'admin', password: 'admin', role: 'admin' }];
            localStorage.setItem('clinicalHistoryUsers', JSON.stringify(defaultAdmin));
            return defaultAdmin;
        }
    });
    const [records, setRecords] = useState<Record[]>(() => {
        try {
            const saved = localStorage.getItem('clinicalHistoryRecords');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [clinicalDetails, setClinicalDetails] = useState<{[key: string]: ClinicalDetails}>(() => {
        try {
            const saved = localStorage.getItem('clinicalHistoryDetails');
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    });
    const [requests, setRequests] = useState<Request[]>(() => {
        try {
            const saved = localStorage.getItem('clinicalHistoryRequests');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>(() => {
        try {
            const saved = localStorage.getItem('clinicalHistoryTransfers');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [notifications, setNotifications] = useState<Notification[]>(() => {
        try {
            const saved = localStorage.getItem('clinicalHistoryNotifications');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    
    const [formData, setFormData] = useState<FormData>(initialFormState);
    const [requestFormData, setRequestFormData] = useState<RequestFormData>({ ...initialRequestFormState, requesterName: currentUser?.username || '' });
    const [editingId, setEditingId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [serviceFilter, setServiceFilter] = useState<string>('');
    
    // Modals State
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [returningRecordId, setReturningRecordId] = useState<number | null>(null);
    const [returnDateInput, setReturnDateInput] = useState(getLocalDateTimeString());
    const [receivingStaffInput, setReceivingStaffInput] = useState('');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null);
    const [isUserManagementModalOpen, setIsUserManagementModalOpen] = useState(false);
    const [isHistoryDetailModalOpen, setIsHistoryDetailModalOpen] = useState(false);
    const [selectedHcNumber, setSelectedHcNumber] = useState<string | null>(null);
    const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
    const [rejectingRequest, setRejectingRequest] = useState<Request | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
    const [isDeleteUserModalOpen, setIsDeleteUserModalOpen] = useState(false);
    const [deletingUsername, setDeletingUsername] = useState<string | null>(null);
    const [requestError, setRequestError] = useState('');
    const [requestInfoMessage, setRequestInfoMessage] = useState('');
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [transferringRecord, setTransferringRecord] = useState<Record | null>(null);
    const [transferToService, setTransferToService] = useState('');

    const isAdmin = currentUser?.role === 'admin';

    // Effects
    useEffect(() => {
        try { localStorage.setItem('clinicalHistoryUsers', JSON.stringify(users)); } 
        catch (error) { console.error('Error saving users to localStorage', error); }
    }, [users]);
    useEffect(() => {
        try { localStorage.setItem('clinicalHistoryRecords', JSON.stringify(records)); } 
        catch (error) { console.error('Error saving records to localStorage', error); }
    }, [records]);
    useEffect(() => {
        try { localStorage.setItem('clinicalHistoryDetails', JSON.stringify(clinicalDetails)); } 
        catch (error) { console.error('Error saving details to localStorage', error); }
    }, [clinicalDetails]);
    useEffect(() => {
        try { localStorage.setItem('clinicalHistoryRequests', JSON.stringify(requests)); } 
        catch (error) { console.error('Error saving requests to localStorage', error); }
    }, [requests]);
     useEffect(() => {
        try { localStorage.setItem('clinicalHistoryTransfers', JSON.stringify(pendingTransfers)); }
        catch (error) { console.error('Error saving pending transfers to localStorage', error); }
    }, [pendingTransfers]);
    useEffect(() => {
        try { localStorage.setItem('clinicalHistoryNotifications', JSON.stringify(notifications)); } 
        catch (error) { console.error('Error saving notifications to localStorage', error); }
    }, [notifications]);

    useEffect(() => {
        // When the user changes (login, logout, refresh), reset the request form
        if (currentUser) {
            setRequestFormData({
                ...initialRequestFormState, // Resets hcNumbers, etc.
                requesterName: currentUser.username,
                // Pre-fill destination service for guests with an assigned service.
                // Other users will get an empty, editable field.
                destinationService: (currentUser.role === 'invitado' && currentUser.service)
                    ? currentUser.service
                    : '',
            });
        }
    }, [currentUser]);


    // User Management Handlers
    const handleAddUser = (userToAdd: User) => {
        if (!userToAdd.username.trim() || !userToAdd.password.trim()) {
            alert('El nombre de usuario y la contraseña no pueden estar vacíos.');
            return false;
        }
        if (users.some(u => u.username.toLowerCase() === userToAdd.username.trim().toLowerCase())) {
            alert('El nombre de usuario ya existe.');
            return false;
        }
        setUsers(prev => [...prev, { ...userToAdd, username: userToAdd.username.trim() }]);
        alert(`Usuario "${userToAdd.username.trim()}" agregado con éxito.`);
        return true;
    };

    const startDeleteUserProcess = (username: string) => {
        if (username === 'admin') {
            alert('No se puede eliminar al administrador por defecto.');
            return;
        }
        if (username === currentUser?.username) {
            alert('No puede eliminar su propia cuenta de usuario mientras está en una sesión activa.');
            return;
        }
        setDeletingUsername(username);
        setIsDeleteUserModalOpen(true);
    };

    const handleConfirmDeleteUser = () => {
        if (!deletingUsername) return;
        setUsers(prev => prev.filter(u => u.username !== deletingUsername));
        setRequests(prev => prev.filter(r => r.requesterName !== deletingUsername));
        setNotifications(prev => prev.filter(n => n.userId !== deletingUsername));
        alert(`Usuario "${deletingUsername}" eliminado con éxito.`);
        handleCancelDeleteUser();
    };

    const handleCancelDeleteUser = () => {
        setIsDeleteUserModalOpen(false);
        setDeletingUsername(null);
    };
    
    // Handlers
    const handleLogin = (username: string, password: string) => {
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (user && user.password === password) {
            setCurrentUser(user);
            sessionStorage.setItem('currentUser', JSON.stringify(user));
        } else {
            alert('Usuario o contraseña incorrectos.');
        }
    };
    const handleLogout = () => {
        setCurrentUser(null);
        sessionStorage.removeItem('currentUser');
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!isAdmin || isFormIncomplete) return;

        const hcNumbers = formData.hcNumber.split(',').map(hc => hc.trim()).filter(hc => hc);
        if (hcNumbers.length === 0) {
            alert("Por favor, ingrese al menos un número de historia clínica.");
            return;
        }

        // Check if any of the HCs are already loaned out, excluding the one being edited
        const loanedOutHcs = hcNumbers.filter(hc => 
            records.some(rec => rec.hcNumber === hc && rec.status === 'Prestado' && rec.id !== editingId)
        );

        if (loanedOutHcs.length > 0) {
            alert(`Error: La(s) siguiente(s) historia(s) clínica(s) ya se encuentra(n) en estado de préstamo y no puede(n) ser registrada(s) de nuevo hasta su devolución: ${loanedOutHcs.join(', ')}`);
            return;
        }

        if (editingId !== null) {
            setRecords(records.map(rec => rec.id === editingId ? { ...rec, ...formData, id: editingId } : rec));
            setEditingId(null);
        } else {
            const newRecords: Record[] = hcNumbers.map((hcNumber, index) => ({
                id: Date.now() + index, hcNumber,
                destinationService: formData.destinationService,
                responsible: formData.responsible,
                responsiblePhoneNumber: formData.responsiblePhoneNumber,
                requestDate: formData.requestDate,
                status: 'Prestado', returnDate: null, receivingStaffName: null,
            }));
            setRecords(prev => [...prev, ...newRecords]);
        }
        setFormData(initialFormState);
    };
    
    const handleRequestInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setRequestFormData(prev => ({ ...prev, [name]: value }));
        if (requestError) setRequestError('');
        if (requestInfoMessage) setRequestInfoMessage('');
    };

    const handleRequestSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setRequestError('');
        setRequestInfoMessage('');

        if (!requestFormData.hcNumbers || !requestFormData.destinationService) return;

        // Use Set to handle duplicates from user input
        const hcNumbersToRequest = [...new Set(requestFormData.hcNumbers.split(',').map(hc => hc.trim()).filter(Boolean))];

        if (hcNumbersToRequest.length === 0) {
            setRequestError("Por favor, ingrese al menos un número de historia clínica.");
            return;
        }

        const loanedOutHcs = hcNumbersToRequest.filter(hc =>
            records.some(rec => rec.hcNumber === hc && rec.status === 'Prestado')
        );

        // Also check against other pending requests to avoid duplicate requests for the same HC
        const pendingHcs = hcNumbersToRequest.filter(hc =>
            requests.some(req => req.hcNumbers.split(',').map(h => h.trim()).includes(hc))
        );

        const unavailableHcs = [...new Set([...loanedOutHcs, ...pendingHcs])];
        const availableHcs = hcNumbersToRequest.filter(hc => !unavailableHcs.includes(hc));

        // Set warning/error messages based on availability
        if (unavailableHcs.length > 0) {
            const loanedMessage = loanedOutHcs.length > 0 ? `Ya prestada(s): ${loanedOutHcs.join(', ')}.` : '';
            const pendingMessage = pendingHcs.length > 0 ? `Ya en otra solicitud: ${pendingHcs.join(', ')}.` : '';
            const fullMessage = `Algunas H.C. no pudieron ser solicitadas. ${loanedMessage} ${pendingMessage}`.trim();

            if (availableHcs.length === 0) {
                // If ALL requested HCs are unavailable, show an error and stop.
                setRequestError(fullMessage);
                return;
            } else {
                // If SOME are unavailable, show an informational message.
                setRequestInfoMessage(fullMessage);
            }
        }

        // If there are any available HCs, create a request for them.
        if (availableHcs.length > 0) {
            const newRequest: Request = {
                id: Date.now(),
                ...requestFormData,
                hcNumbers: availableHcs.join(', '), // Create request only with available HCs
                requestTimestamp: Date.now()
            };
            setRequests(prev => [...prev, newRequest]);
            setRequestFormData({ ...initialRequestFormState, requesterName: currentUser?.username || '' });

            // Provide clear feedback to the user via an alert.
            const successMessage = unavailableHcs.length > 0
                ? `Solicitud enviada para las H.C. disponibles: ${availableHcs.join(', ')}.`
                : 'Solicitud enviada para aprobación.';

            alert(successMessage);
        }
    };

    const handleApproveRequest = (request: Request) => {
        if (request.requesterName === currentUser?.username) {
            alert('No puede aprobar sus propias solicitudes.');
            return;
        }

        const hcNumbers = request.hcNumbers.split(',').map(hc => hc.trim()).filter(hc => hc);
        
        const loanedOutHcs = hcNumbers.filter(hc => 
            records.some(rec => rec.hcNumber === hc && rec.status === 'Prestado')
        );

        if (loanedOutHcs.length > 0) {
            alert(`No se puede aprobar la solicitud. La(s) siguiente(s) historia(s) clínica(s) ya ha(n) sido prestada(s): ${loanedOutHcs.join(', ')}. Por favor, rechace esta solicitud o espere su devolución.`);
            return;
        }

        const newRecords: Record[] = hcNumbers.map((hcNumber, index) => ({
            id: Date.now() + index,
            hcNumber,
            destinationService: request.destinationService,
            responsible: request.requesterName,
            responsiblePhoneNumber: 'N/A',
            requestDate: getLocalDateTimeString(),
            status: 'Prestado',
            returnDate: null,
            receivingStaffName: null,
        }));
        setRecords(prev => [...prev, ...newRecords].sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime()));
        setRequests(prev => prev.filter(r => r.id !== request.id));
    };

    const startRejectionProcess = (request: Request) => {
        setRejectingRequest(request);
        setIsRejectionModalOpen(true);
    };
    const handleCancelRejection = () => {
        setIsRejectionModalOpen(false);
        setRejectingRequest(null);
        setRejectionReason('');
    };
    const handleConfirmRejection = () => {
        if (!rejectingRequest || !rejectionReason.trim()) return;
        
        const newNotification: Notification = {
            id: Date.now(),
            userId: rejectingRequest.requesterName,
            message: `Su solicitud para H.C. "${rejectingRequest.hcNumbers}" ha sido rechazada. Motivo: ${rejectionReason}`,
            timestamp: Date.now(),
            isRead: false,
            type: 'rejection'
        };
        setNotifications(prev => [...prev, newNotification]);
        setRequests(prev => prev.filter(r => r.id !== rejectingRequest.id));
        handleCancelRejection();
    };


    const handleEdit = (record: Record) => {
        if (!isAdmin) return;
        setEditingId(record.id);
        setFormData({
            hcNumber: record.hcNumber, destinationService: record.destinationService,
            responsible: record.responsible, responsiblePhoneNumber: record.responsiblePhoneNumber,
            requestDate: record.requestDate
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setFormData(initialFormState);
    };

    const startDeleteProcess = (id: number) => {
        if (!isAdmin) return;
        setDeletingRecordId(id);
        setIsDeleteModalOpen(true);
    };
    const handleConfirmDelete = () => {
        if (!deletingRecordId) return;
        setRecords(records.filter(rec => rec.id !== deletingRecordId));
        if (deletingRecordId === editingId) handleCancelEdit();
        setIsDeleteModalOpen(false); setDeletingRecordId(null);
    };
    const handleCancelDelete = () => {
        setIsDeleteModalOpen(false); setDeletingRecordId(null);
    };
    
    // Admin opens the modal to confirm reception
    const startReturnProcess = (id: number) => {
        if (!isAdmin) return;
        setReturningRecordId(id);
        setReturnDateInput(getLocalDateTimeString());
        // Pre-fill with admin's name, but allow changes
        setReceivingStaffInput(currentUser?.username || '');
        setIsReturnModalOpen(true);
    };

    // Guest user requests the return, changing status to pending and notifying admins
    const requestReturn = (id: number) => {
        const recordToReturn = records.find(rec => rec.id === id);
        if (!recordToReturn) return;

        // Update the record status
        setRecords(records.map(rec =>
            rec.id === id ? { ...rec, status: 'Pendiente de Devolución' } : rec
        ));

        // Create notifications for all admins
        const admins = users.filter(u => u.role === 'admin');
        const newNotifications: Notification[] = admins.map(admin => ({
            id: Date.now() + Math.random(),
            userId: admin.username,
            message: `El servicio "${recordToReturn.destinationService}" ha solicitado la devolución de la H.C. N° ${recordToReturn.hcNumber}. Por favor, confirme la recepción.`,
            timestamp: Date.now(),
            isRead: false,
            type: 'approval', // Using 'approval' for the green style
        }));
        setNotifications(prev => [...prev, ...newNotifications]);

        // Show confirmation to the guest user
        alert('Solicitud de devolución enviada con éxito. El administrador será notificado para confirmar la recepción.');
    };
    
    // Admin confirms the return via modal
    const handleConfirmReturn = () => {
        if (!returningRecordId || !returnDateInput || !receivingStaffInput.trim()) {
            alert('Por favor, complete todos los campos.'); return;
        }
        setRecords(records.map(rec => rec.id === returningRecordId ? { ...rec, status: 'Devuelto', returnDate: returnDateInput, receivingStaffName: receivingStaffInput.trim() } : rec));
        setIsReturnModalOpen(false); setReturningRecordId(null); setReceivingStaffInput('');
    };

    const handleCancelReturn = () => {
        setIsReturnModalOpen(false); setReturningRecordId(null);
    };

    const startTransferProcess = (record: Record) => {
        setTransferringRecord(record);
        setTransferToService('');
        setIsTransferModalOpen(true);
    };
    const handleCancelTransfer = () => {
        setIsTransferModalOpen(false);
        setTransferringRecord(null);
        setTransferToService('');
    };
    const handleConfirmTransfer = () => {
        if (!transferringRecord || !transferToService || !currentUser) return;
        
        const newTransfer: PendingTransfer = {
            id: Date.now(),
            recordId: transferringRecord.id,
            hcNumber: transferringRecord.hcNumber,
            fromService: transferringRecord.destinationService,
            toService: transferToService,
            requesterName: currentUser.username,
            requestTimestamp: Date.now(),
        };

        setPendingTransfers(prev => [...prev, newTransfer]);
        alert('Solicitud de transferencia enviada. El servicio de destino debe aceptarla.');
        handleCancelTransfer();
    };

    const handleAcceptTransfer = (transferId: number) => {
        const transfer = pendingTransfers.find(t => t.id === transferId);
        if (!transfer || !currentUser) return;

        const now = getLocalDateTimeString();
        
        // 1. Update original record to 'Transferido'
        const updatedRecords = records.map(rec => 
            rec.id === transfer.recordId 
                ? { ...rec, status: 'Transferido' as const, returnDate: now, receivingStaffName: `Transferido a ${transfer.toService}` } 
                : rec
        );
        
        // 2. Create new record for the destination service
        const newRecord: Record = {
            id: Date.now(),
            hcNumber: transfer.hcNumber,
            destinationService: transfer.toService,
            responsible: currentUser.username, // The user accepting the transfer
            responsiblePhoneNumber: 'N/A',
            requestDate: now,
            status: 'Prestado',
            returnDate: null,
            receivingStaffName: null,
        };

        // 3. Update state
        setRecords([...updatedRecords, newRecord]);
        setPendingTransfers(prev => prev.filter(t => t.id !== transferId));

        // 4. Notify original requester
        const newNotification: Notification = {
            id: Date.now() + 1,
            userId: transfer.requesterName,
            message: `La transferencia de H.C. "${transfer.hcNumber}" a ${transfer.toService} fue aceptada.`,
            timestamp: Date.now(),
            isRead: false,
            type: 'approval',
        };
        setNotifications(prev => [...prev, newNotification]);

        alert('Transferencia aceptada.');
    };

    const handleRejectTransfer = (transferId: number) => {
        const transfer = pendingTransfers.find(t => t.id === transferId);
        if (!transfer) return;

        // 1. Notify original requester
        const newNotification: Notification = {
            id: Date.now(),
            userId: transfer.requesterName,
            message: `La transferencia de H.C. "${transfer.hcNumber}" a ${transfer.toService} fue rechazada.`,
            timestamp: Date.now(),
            isRead: false,
            type: 'rejection',
        };
        setNotifications(prev => [...prev, newNotification]);

        // 2. Remove pending transfer
        setPendingTransfers(prev => prev.filter(t => t.id !== transferId));
        alert('Transferencia rechazada. Se ha notificado al solicitante.');
    };
    
    const openHistoryDetail = (hcNumber: string) => {
        setSelectedHcNumber(hcNumber);
        setIsHistoryDetailModalOpen(true);
    };

    const handleDeleteClinicalHistory = (hcNumber: string) => {
        if (!isAdmin) return;
        if (window.confirm(`¿Está seguro de que desea eliminar TODA la historia clínica y los registros de préstamo para el N° H.C. ${hcNumber}? Esta acción es permanente.`)) {
            setRecords(records.filter(r => r.hcNumber !== hcNumber));
            setClinicalDetails(currentDetails => {
                const newDetails = { ...currentDetails };
                delete newDetails[hcNumber];
                return newDetails;
            });
            setIsHistoryDetailModalOpen(false);
            setSelectedHcNumber(null);
        }
    };
    
    const handleOpenNotificationsPanel = () => {
        setIsNotificationsPanelOpen(true);
        // Mark notifications as read
        setNotifications(prev => prev.map(n => 
            n.userId === currentUser?.username ? { ...n, isRead: true } : n
        ));
    };

    const uniqueServices = useMemo(() => {
        const services = new Set(records.map(rec => rec.destinationService).filter(Boolean));
        return Array.from(services).sort();
    }, [records]);
    
    const guestServices = useMemo(() => {
        return [...new Set(users.filter(u => u.role === 'invitado' && u.service).map(u => u.service!))].sort();
    }, [users]);

    const visibleRequests = useMemo(() => {
        if (!currentUser) return [];
        if (isAdmin) {
            return [...requests].sort((a, b) => b.requestTimestamp - a.requestTimestamp);
        }
        if (currentUser.role === 'invitado' && currentUser.service) {
            const userService = currentUser.service.toLowerCase();
            return requests
                .filter(req => req.destinationService.toLowerCase() === userService)
                .sort((a, b) => b.requestTimestamp - a.requestTimestamp);
        }
        return [];
    }, [requests, currentUser, isAdmin]);
    
    const incomingTransfers = useMemo(() => {
        if (!currentUser || currentUser.role !== 'invitado' || !currentUser.service) return [];
        return pendingTransfers
            .filter(t => t.toService === currentUser.service)
            .sort((a, b) => b.requestTimestamp - a.requestTimestamp);
    }, [pendingTransfers, currentUser]);
    
    const pendingTransferRecordIds = useMemo(() => {
        return new Set(pendingTransfers.map(t => t.recordId));
    }, [pendingTransfers]);

    const filteredAndSortedRecords = useMemo(() => {
        const baseRecords = isAdmin || !currentUser?.service
            ? records
            : records.filter(rec => rec.destinationService.toLowerCase() === currentUser.service!.toLowerCase());

        const lowercasedSearchTerm = searchTerm.toLowerCase();

        const filtered = baseRecords.filter(rec => {
            const serviceMatch = !serviceFilter || rec.destinationService === serviceFilter;
            const searchMatch = !lowercasedSearchTerm || (
                rec.hcNumber.toLowerCase().includes(lowercasedSearchTerm) ||
                rec.destinationService.toLowerCase().includes(lowercasedSearchTerm) ||
                rec.responsible.toLowerCase().includes(lowercasedSearchTerm) ||
                rec.status.toLowerCase().includes(lowercasedSearchTerm)
            );
            return serviceMatch && searchMatch;
        });
        
        const statusOrder = { 'Pendiente de Devolución': 1, 'Prestado': 2, 'Devuelto': 3, 'Transferido': 4 };

        return [...filtered].sort((a, b) => {
            const statusA = statusOrder[a.status] || 99;
            const statusB = statusOrder[b.status] || 99;
            if (statusA !== statusB) {
                return statusA - statusB;
            }
            return new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime();
        });
    }, [records, searchTerm, serviceFilter, currentUser, isAdmin]);
    
    const userNotifications = useMemo(() => {
        if (!currentUser) return [];
        return notifications.filter(n => n.userId === currentUser.username);
    }, [notifications, currentUser]);

    const unreadNotificationsCount = useMemo(() => {
        if (!currentUser) return 0;
        return notifications.filter(n => n.userId === currentUser.username && !n.isRead).length;
    }, [notifications, currentUser]);

    const exportToExcel = () => {
        const dataToExport = filteredAndSortedRecords.map(rec => ({
            'N° H.C.': rec.hcNumber,
            'Servicio de Destino': rec.destinationService,
            'Responsable': rec.responsible,
            'Celular': rec.responsiblePhoneNumber,
            'Fecha de Préstamo': formatDateTime(rec.requestDate),
            'Fecha de Devolución': formatDateTime(rec.returnDate),
            'Recepcionado por': rec.status === 'Devuelto' ? rec.receivingStaffName : '—',
            'Estado': rec.status,
        }));
    
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Historias Clínicas");
        XLSX.writeFile(wb, "ControlHistoriasClinicas_HospitalQuillabamba.xlsx");
    };

    const exportToPDF = () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });
        
        doc.text("Reporte de Control de Historias Clínicas - Hospital de Quillabamba", 14, 16);
        
        const tableColumn = ["N° H.C.", "Servicio", "Responsable", "Celular", "F. Préstamo", "F. Devolución", "Recepcionado por", "Estado"];
        const tableRows: any[] = [];
    
        filteredAndSortedRecords.forEach(rec => {
            const recordData = [
                rec.hcNumber,
                rec.destinationService,
                rec.responsible,
                rec.responsiblePhoneNumber,
                formatDateTime(rec.requestDate),
                formatDateTime(rec.returnDate),
                rec.receivingStaffName || '—',
                rec.status
            ];
            tableRows.push(recordData);
        });
    
        (doc as any).autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 20,
            theme: 'striped',
            headStyles: { fillColor: [0, 90, 156] },
            styles: { fontSize: 7.5 }, // Slightly reduced font size for better fit
            columnStyles: {
                0: { cellWidth: 15 }, // N° H.C.
                3: { cellWidth: 20 }, // Celular
                4: { cellWidth: 28 }, // F. Préstamo
                5: { cellWidth: 28 }, // F. Devolución
                7: { cellWidth: 28 }, // Estado
                // Columns 1 (Servicio), 2 (Responsable), and 6 (Recepcionado por) will auto-size to fit content
            }
        });
        
        doc.save("ControlHistoriasClinicas_HospitalQuillabamba.pdf");
    };

    const isFormIncomplete = !formData.hcNumber || !formData.destinationService || !formData.responsible || !formData.responsiblePhoneNumber;
    const isRequestFormIncomplete = !requestFormData.hcNumbers || !requestFormData.destinationService;
    
    if (!currentUser) {
        return <LoginScreen onLogin={handleLogin} users={users} />;
    }

    const getStatusClass = (status: Record['status']) => {
        switch (status) {
            case 'Prestado': return 'status-prestado';
            case 'Devuelto': return 'status-devuelto';
            case 'Pendiente de Devolución': return 'status-pendiente-devolucion';
            case 'Transferido': return 'status-transferido';
            default: return '';
        }
    };


    return (
        <React.Fragment>
            <header className="app-header">
                <h1>Control de Historias Clínicas del HOSPITAL de QUILLABAMBA</h1>
                <div className="header-controls">
                    <div className="user-info">
                        Usuario: <span>{currentUser.username}</span> ({currentUser.role})
                        {currentUser.role === 'invitado' && currentUser.service && <div>Servicio: <span>{currentUser.service}</span></div>}
                    </div>
                    
                    <div style={{position: 'relative'}}>
                        <button onClick={handleOpenNotificationsPanel} className="icon-btn notification-bell" title="Ver notificaciones">
                            {ICONS.BELL}
                            {unreadNotificationsCount > 0 && <span className="notification-badge">{unreadNotificationsCount}</span>}
                        </button>
                    </div>

                    {isAdmin && (
                         <div style={{position: 'relative'}}>
                            <button onClick={() => setIsUserManagementModalOpen(true)} className="btn btn-secondary">Gestionar Usuarios</button>
                            {visibleRequests.length > 0 && <span className="notification-badge on-button">{visibleRequests.length}</span>}
                        </div>
                    )}
                    <button onClick={handleLogout} className="btn btn-danger">Cerrar Sesión</button>
                </div>
            </header>
            <main>
                <aside>
                    <div className="card">
                        {isAdmin ? (
                            <>
                                <h2>{editingId !== null ? 'Editar Préstamo' : 'Formulario de Préstamo'}</h2>
                                <form onSubmit={handleSubmit}>
                                    <div className="form-group">
                                        <label htmlFor="hcNumber">N° de Historia(s) Clínica(s)</label>
                                        <input type="text" id="hcNumber" name="hcNumber" className="form-control" value={formData.hcNumber} onChange={handleInputChange} placeholder="Ej: 12345, 67890" required />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="destinationService">Servicio de Destino</label>
                                        <input type="text" id="destinationService" name="destinationService" className="form-control" value={formData.destinationService} onChange={handleInputChange} required />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="responsible">Responsable del Préstamo</label>
                                        <input type="text" id="responsible" name="responsible" className="form-control" value={formData.responsible} onChange={handleInputChange} required />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="responsiblePhoneNumber">Celular del Responsable</label>
                                        <input type="tel" id="responsiblePhoneNumber" name="responsiblePhoneNumber" className="form-control" value={formData.responsiblePhoneNumber} onChange={handleInputChange} placeholder="Ej: 987654321" required />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="requestDate">Fecha y Hora de Préstamo</label>
                                        <input type="datetime-local" id="requestDate" name="requestDate" className="form-control" value={formData.requestDate} onChange={handleInputChange} required />
                                    </div>
                                    <div className="btn-container">
                                        <button type="submit" className="btn btn-primary" disabled={isFormIncomplete}>
                                            {editingId !== null ? 'Actualizar' : 'Registrar Préstamo'}
                                        </button>
                                        {editingId !== null && <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>Cancelar</button>}
                                    </div>
                                </form>
                            </>
                        ) : (
                             <>
                                <h2>Formulario de Solicitud</h2>
                                <form onSubmit={handleRequestSubmit}>
                                    <div className="form-group">
                                        <label htmlFor="hcNumbers">N° de Historia(s) Clínica(s)</label>
                                        <input type="text" id="hcNumbers" name="hcNumbers" className="form-control" value={requestFormData.hcNumbers} onChange={handleRequestInputChange} placeholder="Ej: 12345, 67890" required />
                                    </div>
                                     <div className="form-group">
                                        <label htmlFor="destinationService">Servicio de Destino</label>
                                        <input type="text" id="destinationService" name="destinationService" className="form-control" value={requestFormData.destinationService} onChange={handleRequestInputChange} placeholder="Servicio al que se dirige" required readOnly={currentUser.role === 'invitado' && !!currentUser.service} />
                                    </div>
                                     <div className="form-group">
                                        <label htmlFor="requesterName">Nombre del Solicitante</label>
                                        <input type="text" id="requesterName" name="requesterName" className="form-control" value={requestFormData.requesterName} onChange={handleRequestInputChange} required readOnly />
                                    </div>
                                    {requestError && <p className="form-error-message">{requestError}</p>}
                                    {requestInfoMessage && <p className="form-info-message">{requestInfoMessage}</p>}
                                    <div className="btn-container">
                                        <button type="submit" className="btn btn-primary" disabled={isRequestFormIncomplete}>Enviar Solicitud</button>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </aside>
                <section>
                    {visibleRequests.length > 0 && (
                        <div className="card pending-requests-container">
                            <h2>Solicitudes Pendientes ({visibleRequests.length})</h2>
                            {visibleRequests.map(req => (
                                <div key={req.id} className="pending-request-item">
                                    <div className="pending-request-details">
                                        <p><strong>N° H.C.:</strong> {req.hcNumbers}</p>
                                        <p><strong>Servicio:</strong> {req.destinationService}</p>
                                        <p><strong>Solicitante:</strong> {req.requesterName}</p>
                                    </div>
                                    {isAdmin && (
                                        <div className="btn-container">
                                            <button
                                                onClick={() => handleApproveRequest(req)}
                                                className="btn btn-success"
                                                disabled={req.requesterName === currentUser.username}
                                                title={req.requesterName === currentUser.username ? 'No puede aprobar sus propias solicitudes.' : 'Aprobar solicitud'}
                                            >
                                                Aprobar
                                            </button>
                                            <button onClick={() => startRejectionProcess(req)} className="btn btn-danger">Rechazar</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {currentUser.role === 'invitado' && incomingTransfers.length > 0 && (
                        <div className="card pending-transfers-container">
                            <h2>Transferencias Pendientes ({incomingTransfers.length})</h2>
                            {incomingTransfers.map(transfer => (
                                <div key={transfer.id} className="pending-request-item">
                                    <div className="pending-request-details">
                                        <p><strong>N° H.C.:</strong> {transfer.hcNumber}</p>
                                        <p><strong>Desde:</strong> {transfer.fromService}</p>
                                        <p><strong>Solicitante:</strong> {transfer.requesterName}</p>
                                    </div>
                                    <div className="btn-container">
                                        <button onClick={() => handleAcceptTransfer(transfer.id)} className="btn btn-success">Aceptar</button>
                                        <button onClick={() => handleRejectTransfer(transfer.id)} className="btn btn-danger">Rechazar</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="card">
                        <div className="list-header">
                            <h2>Listado ({filteredAndSortedRecords.length})</h2>
                             <div className="filters-container">
                                {isAdmin && (
                                    <select className="form-control" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} title="Filtrar por servicio de destino">
                                        <option value="">Todos los Servicios</option>
                                        {uniqueServices.map(service => (
                                            <option key={service} value={service}>{service}</option>
                                        ))}
                                    </select>
                                )}
                                <input type="text" placeholder="Buscar en la lista..." className="form-control" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                            <div className="btn-container">
                                <button onClick={exportToPDF} className="btn btn-export">{ICONS.PDF} PDF</button>
                                <button onClick={exportToExcel} className="btn btn-export">{ICONS.EXCEL} Excel</button>
                            </div>
                        </div>
                        <div className="table-container">
                            <table className="history-table">
                                <thead>
                                    <tr><th>N° H.C.</th><th>Servicio</th><th>Responsable</th><th>Celular</th><th>F. Préstamo</th><th>F. Devolución</th><th>Recepcionado por</th><th>Estado</th>{(isAdmin || currentUser.role === 'invitado') && <th>Acciones</th>}</tr>
                                </thead>
                                <tbody>
                                    {filteredAndSortedRecords.length > 0 ? filteredAndSortedRecords.map(rec => {
                                        const isTransferPending = currentUser.role === 'invitado' && pendingTransferRecordIds.has(rec.id);
                                        return (
                                        <tr key={rec.id}>
                                            <td onClick={() => openHistoryDetail(rec.hcNumber)} className="clickable-hc" title={`Ver detalles de H.C. ${rec.hcNumber}`}>{rec.hcNumber}</td>
                                            <td onClick={() => isAdmin && setServiceFilter(rec.destinationService)} className={isAdmin ? "clickable-service" : ""} title={isAdmin ? `Filtrar por: ${rec.destinationService}`: ""}>{rec.destinationService}</td>
                                            <td>{rec.responsible}</td><td>{rec.responsiblePhoneNumber}</td>
                                            <td>{formatDateTime(rec.requestDate)}</td><td>{formatDateTime(rec.returnDate)}</td>
                                            <td>{rec.receivingStaffName || '—'}</td>
                                            <td><span className={`status-badge ${getStatusClass(rec.status)}`}>{rec.status}</span></td>
                                            {(isAdmin || currentUser.role === 'invitado') && (
                                                <td className="actions-cell">
                                                    {isAdmin ? (
                                                        <>
                                                            {rec.status === 'Pendiente de Devolución' && <button onClick={() => startReturnProcess(rec.id)} className="icon-btn approve-return" title="Recepcionar HC">{ICONS.APPROVE_RETURN}</button>}
                                                            <button onClick={() => handleEdit(rec)} className="icon-btn edit" title="Editar">{ICONS.EDIT}</button>
                                                            <button onClick={() => startDeleteProcess(rec.id)} className="icon-btn delete" title="Eliminar">{ICONS.DELETE}</button>
                                                        </>
                                                    ) : ( // Guest user
                                                        <>
                                                            {rec.destinationService === currentUser.service && (
                                                                <>
                                                                    {rec.status === 'Prestado' && (
                                                                        <>
                                                                            <button onClick={() => requestReturn(rec.id)} className="icon-btn return" title="Solicitar Devolución">{ICONS.RETURN}</button>
                                                                            {isTransferPending 
                                                                                ? <span className="pending-transfer-badge">Transf. Pendiente</span>
                                                                                : <button onClick={() => startTransferProcess(rec)} className="icon-btn transfer" title="Transferir a otro servicio">{ICONS.TRANSFER}</button>
                                                                            }
                                                                        </>
                                                                    )}
                                                                    {rec.status === 'Pendiente de Devolución' && (
                                                                        <span className="pending-transfer-badge">Devolución Solicitada</span>
                                                                    )}
                                                                </>
                                                            )}
                                                        </>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    )}) : ( <tr><td colSpan={(isAdmin || currentUser.role === 'invitado') ? 9 : 8} style={{ textAlign: 'center', padding: '2rem' }}>No hay registros que coincidan con los filtros.</td></tr> )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            </main>
            {isReturnModalOpen && <ReturnModal onConfirm={handleConfirmReturn} onCancel={handleCancelReturn} date={returnDateInput} setDate={setReturnDateInput} staff={receivingStaffInput} setStaff={setReceivingStaffInput} />}
            {isDeleteModalOpen && <DeleteModal onConfirm={handleConfirmDelete} onCancel={handleCancelDelete} />}
            {isAdmin && isUserManagementModalOpen && <UserManagementModal users={users} onAddUser={handleAddUser} onDeleteUser={startDeleteUserProcess} onClose={() => setIsUserManagementModalOpen(false)} />}
            {isAdmin && isDeleteUserModalOpen && deletingUsername && <DeleteUserModal username={deletingUsername} onConfirm={handleConfirmDeleteUser} onCancel={handleCancelDeleteUser} />}
            {isHistoryDetailModalOpen && selectedHcNumber && <HistoryDetailModal hcNumber={selectedHcNumber} details={clinicalDetails[selectedHcNumber]} setDetails={setClinicalDetails} records={records.filter(r => r.hcNumber === selectedHcNumber)} onClose={() => setIsHistoryDetailModalOpen(false)} isAdmin={isAdmin} onDeleteHistory={handleDeleteClinicalHistory} />}
            {isRejectionModalOpen && <RejectionModal onConfirm={handleConfirmRejection} onCancel={handleCancelRejection} reason={rejectionReason} setReason={setRejectionReason} />}
            {isNotificationsPanelOpen && <NotificationsPanel notifications={userNotifications} onClose={() => setIsNotificationsPanelOpen(false)} />}
            {isTransferModalOpen && transferringRecord && (
                <TransferModal
                    onConfirm={handleConfirmTransfer}
                    onCancel={handleCancelTransfer}
                    services={guestServices.filter(s => s !== currentUser.service)}
                    selectedService={transferToService}
                    setSelectedService={setTransferToService}
                    hcNumber={transferringRecord.hcNumber}
                />
            )}
            <footer className="app-footer"><p>&copy; {new Date().getFullYear()} HARRISON PERCY CASTAÑEDA .</p></footer>
        </React.Fragment>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<React.StrictMode><App /></React.StrictMode>);
}